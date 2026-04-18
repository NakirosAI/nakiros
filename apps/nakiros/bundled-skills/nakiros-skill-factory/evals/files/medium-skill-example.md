---
name: db-backup-manager
description: "Manages database backups and restores."
user-invocable: true
---

# Database Backup Manager

**IMPORTANT: Always speak French with the user. Only these instructions are in English.**

## Backup procedure

1. Connect to the database using credentials from `docs/architecture.md`.
2. Dump the database. Use `mysqldump` or `mariadb-dump` depending on the flavor of the database.
3. Compress the resulting dump with gzip.
4. Upload the compressed dump to S3.
5. Tell the user that the backup is done.

## Restore procedure

1. List the backups in S3 and show them to the user.
2. Download the one the user picks.
3. Restore it. Use `mysql` or `mariadb` depending on the flavor of the database.
4. Tell the user the restore is done.

## Context loading

1. Read `docs/architecture.md` — it contains the DB host, credentials and the S3 bucket name.

## Available commands

- **"backup"** → Create a backup
- **"restore"** → Restore from a backup
