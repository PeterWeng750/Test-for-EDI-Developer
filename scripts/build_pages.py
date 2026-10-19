"""Build a zero-server static site, compatible with GitHub project Pages paths."""
import shutil
import argparse
from pathlib import Path

root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--output',choices=['dist','docs'],default='dist')
args=parser.parse_args()
destination=root/args.output
if destination.exists():
    shutil.rmtree(destination)
shutil.copytree(root/'app'/'static',destination)
index=destination/'index.html'
text=index.read_text().replace('<html lang="th">','<html lang="th" data-runtime="cloud">')
text=text.replace('<meta name="theme-color"', '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data:; connect-src \'self\' https://*.supabase.co; worker-src \'self\'; object-src \'none\'; base-uri \'self\'; form-action \'self\'" />\n    <meta name="referrer" content="no-referrer" />\n    <meta name="theme-color"',1)
index.write_text(text)
shutil.copyfile(root/'supabase'/'schema.sql',destination/'setup.sql')
(destination/'.nojekyll').touch()
print(f'Static Pages site built in {args.output}/; no credentials or customer data included.')
