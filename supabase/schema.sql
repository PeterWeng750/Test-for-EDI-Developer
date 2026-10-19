-- Harbor Free: run this entire file once in Supabase SQL Editor.
-- Only public RPCs are exposed. A random workspace-link token grants team access.
-- No paid extension, Storage bucket, Edge Function, or backend server is required.
begin;

create schema if not exists harbor_private;
revoke all on schema harbor_private from public, anon, authenticated;

create table if not exists harbor_private.workspaces (
  id text primary key,
  revision bigint not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists harbor_private.records (
  workspace_id text not null references harbor_private.workspaces(id),
  identity jsonb not null,
  data jsonb not null,
  version bigint not null default 1,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, identity)
);
create table if not exists harbor_private.batches (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references harbor_private.workspaces(id),
  filename text not null,
  file_hash text not null,
  created_at timestamptz not null default now(),
  added integer not null,
  updated integer not null,
  skipped integer not null,
  invalid integer not null,
  unique(workspace_id, file_hash)
);
create table if not exists harbor_private.revisions (
  id bigint generated always as identity primary key,
  workspace_id text not null references harbor_private.workspaces(id),
  batch_id uuid not null references harbor_private.batches(id),
  old_data jsonb,
  new_data jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists harbor_revision_batch on harbor_private.revisions(workspace_id,batch_id);
alter table harbor_private.workspaces enable row level security;
alter table harbor_private.records enable row level security;
alter table harbor_private.batches enable row level security;
alter table harbor_private.revisions enable row level security;
revoke all on all tables in schema harbor_private from public, anon, authenticated;
revoke all on all sequences in schema harbor_private from public, anon, authenticated;

create or replace function harbor_private.normalized(value text) returns text
language sql immutable set search_path = pg_catalog as $$
  select lower(btrim(regexp_replace(coalesce(value,''), '\s+', ' ', 'g')));
$$;

create or replace function harbor_private.record_key(record jsonb) returns jsonb
language sql immutable set search_path = pg_catalog as $$
  select jsonb_build_array(harbor_private.normalized(record->>'job'),harbor_private.normalized(record->>'invoice'),harbor_private.normalized(record->>'container'));
$$;

create or replace function harbor_private.authorize(p_token text) returns text
language plpgsql stable security definer set search_path = pg_catalog as $$
declare workspace text;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'ลิงก์พื้นที่ทำงานไม่ถูกต้อง' using errcode='28000';
  end if;
  workspace := encode(sha256(convert_to(p_token,'UTF8')),'hex');
  if not exists(select 1 from harbor_private.workspaces where id=workspace) then
    raise exception 'ไม่พบพื้นที่ทำงาน ตรวจสอบว่าเปิดลิงก์เต็มที่ทีมส่งให้' using errcode='28000';
  end if;
  return workspace;
end;
$$;

create or replace function harbor_private.validate_record(record jsonb) returns void
language plpgsql immutable set search_path = pg_catalog as $$
declare field text; value jsonb; stamp text; num numeric;
begin
  if jsonb_typeof(record) is distinct from 'object' or (select count(*) from jsonb_object_keys(record)) > 60 then
    raise exception 'รูปแบบรายการไม่ถูกต้อง';
  end if;
  foreach field in array array['job','invoice','container'] loop
    if jsonb_typeof(record->field) is distinct from 'string' or harbor_private.normalized(record->>field) = '' then
      raise exception 'ขาด Job, Invoice หรือหมายเลขตู้';
    end if;
  end loop;
  for field,value in select * from jsonb_each(record) loop
    if length(field)>200 or jsonb_typeof(value) not in ('string','number','null') or length(value::text)>5002 then
      raise exception 'ค่าข้อมูลหรือ Header ยาวเกินขีดจำกัด';
    end if;
    if field in ('cartons','cbm','container_count') and value <> 'null'::jsonb then
      if jsonb_typeof(value)<>'number' then raise exception 'จำนวนต้องเป็นตัวเลข'; end if;
      num := (value::text)::numeric;
      if num<0 or num>1000000000000 or (field<>'cbm' and num<>trunc(num)) then
        raise exception 'จำนวนสินค้าไม่ถูกต้อง';
      end if;
    end if;
    if field in ('eta','ata','file_date','do_release','complete','customs','plan','release','delivered','received_first','received_latest') then
      stamp := record->>field;
      if coalesce(stamp,'')<>'' then
        if stamp !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$' then raise exception 'รูปแบบวันที่ไม่ถูกต้อง'; end if;
        perform stamp::timestamp;
      end if;
    end if;
  end loop;
  if coalesce(record->>'received_latest','')<>'' and record->>'received_latest' < record->>'received_first' then
    raise exception 'วันแก้ไขเอกสารอยู่ก่อนวันรับครั้งแรก';
  end if;
end;
$$;

create or replace function public.harbor_create_workspace(p_token text) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare workspace text;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'ลิงก์พื้นที่ทำงานไม่ถูกต้อง'; end if;
  workspace := encode(sha256(convert_to(p_token,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended('harbor_workspace_creation',0));
  if not exists(select 1 from harbor_private.workspaces where id=workspace) and (select count(*) from harbor_private.workspaces)>=10 then
    raise exception 'รุ่นทดลองรองรับ 10 พื้นที่ทำงานต่อโปรเจกต์';
  end if;
  insert into harbor_private.workspaces(id) values(workspace) on conflict do nothing;
  return jsonb_build_object('ok',true,'schema_version',1);
end;
$$;

create or replace function public.harbor_snapshot(p_token text,p_known_revision bigint default -1) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog as $$
declare workspace text; revision_number bigint; records_json jsonb; batches_json jsonb;
begin
  workspace := harbor_private.authorize(p_token);
  select revision into revision_number from harbor_private.workspaces where id=workspace;
  if revision_number=p_known_revision then return jsonb_build_object('revision',revision_number,'not_modified',true); end if;
  select coalesce(jsonb_agg(jsonb_build_object('key',identity,'data',data,'version',version,'updated_at',updated_at) order by updated_at desc,identity),'[]'::jsonb)
    into records_json from harbor_private.records where workspace_id=workspace;
  select coalesce(jsonb_agg(to_jsonb(b) order by b.created_at desc,b.id),'[]'::jsonb) into batches_json from (
    select id,filename,file_hash,created_at,added,updated,skipped,invalid
      from harbor_private.batches where workspace_id=workspace order by created_at desc,id limit 100
  ) b;
  return jsonb_build_object('revision',revision_number,'records',records_json,'batches',batches_json,'schema_version',1);
end;
$$;

create or replace function public.harbor_commit(
  p_token text,p_filename text,p_file_hash text,p_rows jsonb,
  p_accept_updates boolean default false,p_skip_invalid boolean default false,
  p_invalid integer default 0,p_duplicates integer default 0
) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare
  workspace text; item jsonb; record jsonb; identity_key jsonb; previous harbor_private.records%rowtype;
  old_version bigint; added_count integer:=0; updated_count integer:=0; skipped_count integer;
  batch uuid:=gen_random_uuid(); timestamp_now timestamptz:=clock_timestamp(); count_rows integer;
begin
  workspace:=harbor_private.authorize(p_token);
  perform 1 from harbor_private.workspaces where id=workspace for update;
  if p_file_hash is null or p_file_hash !~ '^[0-9a-f]{64}$' or p_filename is null or length(p_filename)>250 then raise exception 'ไฟล์ไม่ถูกต้อง'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'รายการนำเข้าไม่ถูกต้อง'; end if;
  count_rows:=jsonb_array_length(p_rows);
  if count_rows<1 or count_rows>10000 or octet_length(p_rows::text)>20000000 or p_invalid<0 or p_duplicates<0 or p_invalid>10000 or p_duplicates>10000 then
    raise exception 'รุ่นฟรีรองรับไม่เกิน 10,000 รายการต่อพื้นที่ทำงาน';
  end if;
  if p_invalid>0 and p_skip_invalid is not true then raise exception 'กรุณายืนยันข้ามแถวที่ไม่สมบูรณ์'; end if;
  if exists(select 1 from harbor_private.batches where workspace_id=workspace and file_hash=p_file_hash) then raise exception 'ไฟล์นี้ถูกนำเข้าแล้ว'; end if;
  if (select count(distinct harbor_private.record_key(value->'data')) from jsonb_array_elements(p_rows))<>count_rows then
    raise exception 'คีย์รายการซ้ำภายในไฟล์';
  end if;
  skipped_count:=p_duplicates;
  for item in select value from jsonb_array_elements(p_rows) loop
    record:=item->'data';
    perform harbor_private.validate_record(record);
    identity_key:=harbor_private.record_key(record);
    select * into previous from harbor_private.records where workspace_id=workspace and identity=identity_key;
    old_version:=(item->>'old_version')::bigint;
    if (case when previous.workspace_id is null then null else previous.version end) is distinct from old_version then
      raise exception 'ข้อมูลเปลี่ยนโดยผู้ใช้อื่น กรุณาเลือกไฟล์ใหม่เพื่อตรวจสอบอีกครั้ง';
    end if;
    if previous.workspace_id is null then added_count:=added_count+1;
    elsif previous.data=record then skipped_count:=skipped_count+1;
    else updated_count:=updated_count+1;
    end if;
  end loop;
  if updated_count>0 and p_accept_updates is not true then raise exception 'กรุณายืนยันการอัปเดตรายการเดิม'; end if;
  if (select count(*) from harbor_private.records where workspace_id=workspace)+added_count>10000 then
    raise exception 'รุ่นฟรีจำกัดข้อมูลสะสม 10,000 รายการต่อพื้นที่ทำงาน';
  end if;
  if exists(
    with incoming as (select harbor_private.record_key(value->'data') identity,value->'data' data from jsonb_array_elements(p_rows)),
    prospective as (
      select r.data from harbor_private.records r where r.workspace_id=workspace and not exists(select 1 from incoming i where i.identity=r.identity)
      union all select data from incoming
    )
    select 1 from prospective group by harbor_private.normalized(data->>'job')
    having count(distinct jsonb_build_array(data->'cartons',data->'cbm'))>1
  ) then raise exception 'Cartons/CBM ของ Job เดียวกันไม่ตรงกัน กรุณาอัปโหลดครบทุกแถวของ Job นั้น'; end if;

  insert into harbor_private.batches(id,workspace_id,filename,file_hash,created_at,added,updated,skipped,invalid)
    values(batch,workspace,p_filename,p_file_hash,timestamp_now,added_count,updated_count,skipped_count,p_invalid);
  for item in select value from jsonb_array_elements(p_rows) loop
    record:=item->'data';identity_key:=harbor_private.record_key(record);
    select * into previous from harbor_private.records where workspace_id=workspace and identity=identity_key;
    if previous.workspace_id is null or previous.data<>record then
      insert into harbor_private.revisions(workspace_id,batch_id,old_data,new_data,created_at)
        values(workspace,batch,previous.data,record,timestamp_now);
      insert into harbor_private.records(workspace_id,identity,data,version,updated_at) values(workspace,identity_key,record,1,timestamp_now)
        on conflict(workspace_id,identity) do update set data=excluded.data,version=harbor_private.records.version+1,updated_at=excluded.updated_at;
    end if;
  end loop;
  update harbor_private.workspaces set revision=revision+1 where id=workspace;
  return jsonb_build_object('batch_id',batch,'counts',jsonb_build_object('new',added_count,'updated',updated_count,'unchanged',skipped_count,'invalid',p_invalid));
end;
$$;

create or replace function public.harbor_history(p_token text,p_batch_id uuid) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog as $$
declare workspace text; result jsonb;
begin
  workspace:=harbor_private.authorize(p_token);
  select coalesce(jsonb_agg(jsonb_build_object('before',old_data,'after',new_data,'at',created_at) order by id),'[]'::jsonb)
    into result from (select * from harbor_private.revisions where workspace_id=workspace and batch_id=p_batch_id order by id limit 100) r;
  return jsonb_build_object('rows',result);
end;
$$;

revoke all on all functions in schema harbor_private from public, anon, authenticated;
revoke all on function public.harbor_create_workspace(text) from public;
revoke all on function public.harbor_snapshot(text,bigint) from public;
revoke all on function public.harbor_commit(text,text,text,jsonb,boolean,boolean,integer,integer) from public;
revoke all on function public.harbor_history(text,uuid) from public;
grant execute on function public.harbor_create_workspace(text) to anon,authenticated;
grant execute on function public.harbor_snapshot(text,bigint) to anon,authenticated;
grant execute on function public.harbor_commit(text,text,text,jsonb,boolean,boolean,integer,integer) to anon,authenticated;
grant execute on function public.harbor_history(text,uuid) to anon,authenticated;

notify pgrst,'reload schema';
commit;
