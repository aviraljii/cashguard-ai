$root=Resolve-Path (Join-Path $PSScriptRoot '../..'); $schema=Join-Path $root 'database/schema/schema.sql'
if (-not $env:DB_NAME) { $env:DB_NAME='cashguard_ai' }; if (-not $env:DB_USER) { $env:DB_USER='root' }; if (-not $env:DB_HOST) { $env:DB_HOST='127.0.0.1' }; if (-not $env:DB_PORT) { $env:DB_PORT='3406' }
if (-not $env:DB_PASSWORD) { throw 'Set DB_PASSWORD before applying the schema.' }
Get-Content -Raw $schema | mysql --host=$env:DB_HOST --port=$env:DB_PORT --user=$env:DB_USER --password=$env:DB_PASSWORD $env:DB_NAME
Get-ChildItem (Join-Path $root 'database/queries/*.sql') | Where-Object { $_.Name -ne 'customer_payment_risk_training.sql' } | Sort-Object Name | ForEach-Object { Get-Content -Raw $_.FullName | mysql --host=$env:DB_HOST --port=$env:DB_PORT --user=$env:DB_USER --password=$env:DB_PASSWORD $env:DB_NAME }
