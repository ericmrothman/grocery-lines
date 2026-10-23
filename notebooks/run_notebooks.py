"""Run every audit notebook top to bottom with plain Python, no Jupyter needed.

python3 notebooks/run_notebooks.py           checks each notebook: every cell runs
                                             without warnings, every assert holds, and
                                             every printed output matches what the
                                             notebook shows.
python3 notebooks/run_notebooks.py --record  runs them and saves the printed output
                                             into the notebooks, for readers who open
                                             them without running anything.
"""
import contextlib
import io
import json
import os
import sys
import warnings
from pathlib import Path

NOTEBOOKS_FOLDER = Path(__file__).resolve().parent


def code_cells(notebook):
    return [cell for cell in notebook['cells'] if cell['cell_type'] == 'code']


def printed_output(cell):
    return ''.join(''.join(output.get('text', [])) for output in cell.get('outputs', []) if output.get('output_type') == 'stream')


@contextlib.contextmanager
def working_folder(folder):
    previous = Path.cwd()
    os.chdir(folder)
    try:
        yield
    finally:
        os.chdir(previous)


def run_cell(notebook_path, number, cell, namespace):
    printed = io.StringIO()
    warned = io.StringIO()
    with contextlib.redirect_stdout(printed), contextlib.redirect_stderr(warned), warnings.catch_warnings():
        warnings.simplefilter('always')
        warnings.showwarning = lambda message, category, *rest: warned.write(f'{category.__name__}: {message}\n')
        try:
            exec(compile(''.join(cell['source']), f'{notebook_path.name} cell {number}', 'exec'), namespace)
        except Exception as error:
            raise SystemExit(f'{notebook_path.name}: code cell {number} failed: {type(error).__name__}: {error}')
    if warned.getvalue():
        raise SystemExit(f'{notebook_path.name}: code cell {number} wrote warnings or errors: {warned.getvalue().strip()}')
    return printed.getvalue()


def run(notebook_path):
    notebook = json.loads(notebook_path.read_text())
    namespace = {'__name__': '__main__'}
    with working_folder(notebook_path.parent):
        printed = [run_cell(notebook_path, number, cell, namespace) for number, cell in enumerate(code_cells(notebook), start=1)]
    return notebook, printed


def record(notebook_path):
    notebook, printed = run(notebook_path)
    for number, (cell, text) in enumerate(zip(code_cells(notebook), printed), start=1):
        cell['execution_count'] = number
        cell['outputs'] = [{'output_type': 'stream', 'name': 'stdout', 'text': text.splitlines(keepends=True)}] if text else []
    notebook_path.write_text(json.dumps(notebook, indent=1, ensure_ascii=False) + '\n')
    print(f'recorded {notebook_path.name}')


def check(notebook_path):
    notebook, printed = run(notebook_path)
    for number, (cell, text) in enumerate(zip(code_cells(notebook), printed), start=1):
        if any(output.get('output_type') != 'stream' or output.get('name') != 'stdout' for output in cell.get('outputs', [])):
            raise SystemExit(f'{notebook_path.name}: code cell {number} has saved output other than printed text, which this check cannot compare. Rerun with --record.')
        if printed_output(cell) != text:
            raise SystemExit(f'{notebook_path.name}: code cell {number} now prints something different from what the notebook shows. Rerun with --record if the change is intended.')
    print(f'checked {notebook_path.name}: {len(printed)} code cells')


def main():
    action = record if '--record' in sys.argv[1:] else check
    for notebook_path in sorted(NOTEBOOKS_FOLDER.glob('*.ipynb')):
        action(notebook_path)


if __name__ == '__main__':
    main()
