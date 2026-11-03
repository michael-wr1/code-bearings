"""Package freshly built, committed viewer/skill outputs using only the stdlib."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parent.parent


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT, text=True).strip()


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


if git('status', '--porcelain', '--untracked-files=all'):
    raise SystemExit('Commit or set aside source changes before building release archives.')

sha = git('rev-parse', 'HEAD')
version = json.loads((ROOT / 'package.json').read_text())['version']
output = ROOT / '.release'
output.mkdir(exist_ok=True)
# Remove only files from this tool's prior manifest, never arbitrary output paths.
old_manifest = output / 'manifest.json'
if old_manifest.exists():
    for name in json.loads(old_manifest.read_text())['files']:
        if Path(name).name != name:
            raise SystemExit('Invalid previous manifest filename.')
        (output / name).unlink(missing_ok=True)

archives = {}
for kind, source, folder in [
    ('viewer', ROOT / 'dist', 'code-bearings-viewer'),
    ('skill', ROOT / '.skill-build/code-bearings-quiz', 'code-bearings-quiz'),
]:
    files = {str(p.relative_to(source)): p for p in source.rglob('*') if p.is_file()}
    required = {'index.html', 'LICENSE', 'THIRD-PARTY-NOTICES.txt'} if kind == 'viewer' else {
        'SKILL.md', 'LICENSE', 'scripts/quiz-tools.mjs', 'assets/quiz-package-v1.schema.json',
        'assets/third-party-notices.txt', 'references/preparation.md',
        'references/change-set.md', 'references/package-contract.md',
    }
    if not required <= files.keys():
        raise SystemExit(f'{kind} build is incomplete; use npm run build:release.')
    allowed = required | ({name for name in files if name.startswith('assets/index-')
                           and Path(name).suffix in {'.js', '.css'}} if kind == 'viewer' else set())
    if files.keys() != allowed or any(p.is_symlink() for p in files.values()):
        raise SystemExit(f'Unexpected files in {kind} build; inspect before packaging.')
    if kind == 'viewer' and not any(name.endswith('.js') for name in files):
        raise SystemExit('Viewer JavaScript is missing.')
    files['DOWNLOADS.md'] = ROOT / 'docs/downloads.md'
    name = f'code-bearings-{kind}-{version}-{sha[:12]}.zip'
    with zipfile.ZipFile(output / name, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for relative, path in sorted(files.items()):
            # Fixed metadata makes repeat builds comparable; source SHA identifies the snapshot.
            entry = zipfile.ZipInfo(f'{folder}/{relative}', date_time=(2020, 1, 1, 0, 0, 0))
            entry.compress_type = zipfile.ZIP_DEFLATED
            entry.external_attr = 0o100644 << 16
            archive.writestr(entry, path.read_bytes())
    archives[kind] = {'file': name, 'root': folder, 'entries': [f'{folder}/{x}' for x in sorted(files)]}

shutil.copyfile(ROOT / 'examples/code-bearings.quiz.json', output / 'code-bearings.quiz.json')
shutil.copyfile(ROOT / 'docs/downloads.md', output / 'DOWNLOADS.md')
names = [item['file'] for item in archives.values()] + ['code-bearings.quiz.json', 'DOWNLOADS.md']
manifest = {
    'version': version, 'sourceCommit': sha,
    'nodeVersion': subprocess.check_output(['node', '--version'], text=True).strip(),
    'archives': archives, 'files': {name: digest(output / name) for name in sorted(names)},
}
old_manifest.write_text(json.dumps(manifest, indent=2) + '\n')
names.append('manifest.json')
(output / 'SHA256SUMS').write_text(''.join(f'{digest(output / name)}  {name}\n' for name in sorted(names)))
expected = set(names) | {'SHA256SUMS'}
if {p.name for p in output.iterdir()} != expected:
    raise SystemExit('Unexpected files in .release; inspect before distributing it.')
print(f'Prepared viewer and skill downloads for {sha} in .release/')
