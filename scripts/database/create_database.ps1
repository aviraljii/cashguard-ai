param([string]$DatabaseName = $(if ($env:DB_NAME) { $env:DB_NAME } else { 'cashguard_ai' }))
if (-not $env:DB_USER) { $env:DB_USER='root' }; if (-not $env:DB_HOST) { $env:DB_HOST='127.0.0.1' }; if (-not $env:DB_PORT) { $env:DB_PORT='3406' }
if (-not $env:DB_PASSWORD) { throw 'Set DB_PASSWORD before creating the database.' }
mysql --host=$env:DB_HOST --port=$env:DB_PORT --user=$env:DB_USER --password=$env:DB_PASSWORD -e "CREATE DATABASE IF NOT EXISTS ``$DatabaseName``;"
