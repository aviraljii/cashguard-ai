$root=Resolve-Path (Join-Path $PSScriptRoot '../..'); $python=Join-Path $root 'ml/.venv/Scripts/python.exe'; $seed=Join-Path $root 'database/seeds/seed_database.py'
if (-not (Test-Path $python)) { throw "Expected ML virtual environment at $python" }; & $python $seed
