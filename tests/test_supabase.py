"""Real PostgreSQL tests. Set HARBOR_TEST_DSN to a dedicated harbor_test* DB."""
import hashlib
import json
import os
import secrets
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from tests.fixtures import sample_rows,workbook
from app.importer import parse_workbook

DSN=os.environ.get('HARBOR_TEST_DSN')


@unittest.skipUnless(DSN,'Optional PostgreSQL integration: set HARBOR_TEST_DSN')
class SupabaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import psycopg
        cls.pg=psycopg
        with psycopg.connect(DSN) as conn:
            if not conn.info.dbname.startswith('harbor_test'):
                raise RuntimeError('Refusing to run outside a dedicated harbor_test* database')
            for role in ['anon','authenticated']:
                if not conn.execute('select 1 from pg_roles where rolname=%s',[role]).fetchone():
                    conn.execute('create role '+role+' nologin')
            conn.execute((Path(__file__).parents[1]/'supabase/schema.sql').read_text())

    def setUp(self):
        self.tokens=[]
        self.token=self.create()

    def tearDown(self):
        with self.pg.connect(DSN) as conn:
            for token in self.tokens:
                workspace=hashlib.sha256(token.encode()).hexdigest()
                for table in ['revisions','records','batches','workspaces']:
                    conn.execute('delete from harbor_private.'+table+' where '+('id' if table=='workspaces' else 'workspace_id')+'=%s',[workspace])

    def call(self,name,**args):
        from psycopg.types.json import Jsonb
        with self.pg.connect(DSN) as conn:
            conn.execute('set role anon')
            values=[Jsonb(v) if isinstance(v,(dict,list)) else v for v in args.values()]
            named=','.join(f'{k} => %s' for k in args)
            return conn.execute(f'select public.{name}({named})',values).fetchone()[0]

    def create(self):
        token=secrets.token_hex(32);self.tokens.append(token)
        self.assertTrue(self.call('harbor_create_workspace',p_token=token)['ok'])
        return token

    def rows(self):
        return [r['record'] for r in parse_workbook(workbook(sample_rows()))['rows']]

    def snapshot(self,token=None,revision=-1):
        return self.call('harbor_snapshot',p_token=token or self.token,p_known_revision=revision)

    def commit(self,rows=None,old=None,token=None,**options):
        args={'p_token':token or self.token,'p_filename':'synthetic.xlsx','p_file_hash':secrets.token_hex(32),'p_rows':[{'data':r,'old_version':old} for r in (self.rows() if rows is None else rows)]}
        args.update(options)
        return self.call('harbor_commit',**args)

    def test_insert_and_reopen_shared_data(self):
        r=self.commit();self.assertEqual(r['counts'],{'new':12,'updated':0,'unchanged':0,'invalid':0})
        s=self.snapshot();self.assertEqual(len(s['records']),12);self.assertEqual(s['revision'],1)
        self.assertTrue(self.snapshot(revision=1)['not_modified'])
        self.assertEqual(self.snapshot()['records'][0]['version'],1)

    def test_duplicate_file_and_unchanged_rows(self):
        file_hash=secrets.token_hex(32)
        self.commit(p_file_hash=file_hash)
        with self.assertRaisesRegex(self.pg.Error,'ไฟล์นี้ถูกนำเข้าแล้ว'):
            self.commit(old=1,p_file_hash=file_hash)
        r=self.commit(old=1);self.assertEqual(r['counts']['unchanged'],12)
        self.assertEqual(len(self.snapshot()['records']),12)

    def test_updates_require_consent_and_store_before_after(self):
        self.commit();rows=self.rows();rows[0]['delivered']='2026-10-10T00:00:00'
        with self.assertRaisesRegex(self.pg.Error,'ยืนยันการอัปเดต'):
            self.commit(rows,old=1)
        r=self.commit(rows,old=1,p_accept_updates=True)
        self.assertEqual(r['counts']['updated'],1)
        history=self.call('harbor_history',p_token=self.token,p_batch_id=r['batch_id'])['rows']
        self.assertEqual(len(history),1);self.assertEqual(history[0]['before']['delivered'],'');self.assertEqual(history[0]['after']['delivered'],'2026-10-10T00:00:00')

    def test_stale_update_cannot_overwrite_other_user(self):
        self.commit();row=self.rows()[0];row['delivered']='2026-10-10T00:00:00'
        self.commit([row],old=1,p_accept_updates=True)
        row['delivered']='2026-10-11T00:00:00'
        with self.assertRaisesRegex(self.pg.Error,'ผู้ใช้อื่น'):
            self.commit([row],old=1,p_accept_updates=True)

    def test_concurrent_writers_only_one_wins(self):
        self.commit()
        def write(day):
            row=self.rows()[0];row['delivered']=f'2026-10-{day}T00:00:00'
            try:self.commit([row],old=1,p_accept_updates=True);return 'saved'
            except self.pg.Error as error:
                self.assertIn('ผู้ใช้อื่น',str(error));return 'stale'
        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertEqual(sorted(pool.map(write,['10','11'])),['saved','stale'])

    def test_inconsistent_job_totals_reject_atomically(self):
        rows=self.rows();rows[1]['cartons']=1
        with self.assertRaisesRegex(self.pg.Error,'Cartons/CBM'):
            self.commit(rows)
        self.assertEqual(len(self.snapshot()['records']),0);self.assertEqual(self.snapshot()['batches'],[])

    def test_invalid_rows_need_explicit_skip(self):
        with self.assertRaisesRegex(self.pg.Error,'ยืนยันข้าม'):
            self.commit(p_invalid=1)
        result=self.commit(p_invalid=1,p_skip_invalid=True)
        self.assertEqual(result['counts']['invalid'],1)

    def test_direct_table_access_and_private_helpers_denied(self):
        with self.pg.connect(DSN) as conn:
            conn.execute('set role anon')
            with self.assertRaises(self.pg.errors.InsufficientPrivilege):
                conn.execute('select * from harbor_private.records')
        with self.pg.connect(DSN) as conn:
            conn.execute('set role anon')
            with self.assertRaises(self.pg.errors.InsufficientPrivilege):
                conn.execute("select harbor_private.authorize(%s)",[self.token])

    def test_tokens_and_history_are_isolated(self):
        first=self.commit();other=self.create()
        self.assertEqual(self.snapshot(token=other)['records'],[])
        self.assertEqual(self.call('harbor_history',p_token=other,p_batch_id=first['batch_id'])['rows'],[])
        with self.assertRaises(self.pg.Error):self.snapshot(token=secrets.token_hex(32))
        with self.assertRaises(self.pg.Error):self.snapshot(token='short')

    def test_server_validates_numbers_dates_and_duplicate_keys(self):
        for change in [{'cartons':-1},{'cbm':'wrong'},{'eta':'2026-02-31T00:00:00'},{'container_count':1.5},{'job':''}]:
            row=self.rows()[0]|change
            with self.assertRaises(self.pg.Error):self.commit([row])
        row=self.rows()[0]
        with self.assertRaisesRegex(self.pg.Error,'คีย์รายการซ้ำ'):
            self.commit([row,row])
        self.assertEqual(len(self.snapshot()['records']),0)

    def test_schema_reapply_preserves_records(self):
        self.commit()
        with self.pg.connect(DSN) as conn:
            conn.execute((Path(__file__).parents[1]/'supabase/schema.sql').read_text())
        self.assertEqual(len(self.snapshot()['records']),12)

    def test_thirty_concurrent_readers(self):
        self.commit()
        with ThreadPoolExecutor(max_workers=30) as pool:
            result=list(pool.map(lambda _:len(self.snapshot()['records']),range(30)))
        self.assertEqual(result,[12]*30)


if __name__=='__main__':unittest.main()
