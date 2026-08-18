# Migrations

Every schema change is a file in `supabase/migrations/`, applied by the Supabase CLI. Nothing is
pasted into the dashboard.

## One-time setup, per machine

```sh
supabase login                                  # opens a browser
supabase link --project-ref <project-ref>       # from the project's dashboard URL
npm run db:adopt                                # see below — only needed once, ever
```

`db:adopt` marks the migrations that were applied **by hand**, before this project used the CLI, as
already applied. It runs no SQL. Without it `db push` would re-run all of them: most are written
idempotently and would survive, but `030_drop_unused` queries a table it has already dropped, and a
migration runner that usually works is not one.

## Day to day

```sh
npm run db:status     # what is applied here vs what is in the repo
npm run db:new <name> # create an empty timestamped migration
npm run db:push       # apply everything pending
```

## A new database, from nothing

```sh
supabase link --project-ref <new-ref>
npm run db:push       # applies all of them, in order — do NOT run db:adopt
```

`db:adopt` is only for the one database whose migrations predate this setup.

## Writing one

The filename's leading timestamp is the version and orders the run. `npm run db:new` generates it;
never edit a filename that has already been applied anywhere.

Two habits, both learned the hard way in this repo:

**Make it re-runnable where you can.** `create table if not exists`, `create or replace function`,
`add column if not exists`, `drop constraint if exists` before `add constraint`. A migration that
only works once needs everything downstream of it to be perfect.

**Guard what you cannot.** `030_drop_unused` refuses to drop a table that has rows — if someone
started using it, the right response is to find out what they meant, not to delete their data.

The existing files carry the reasoning for each change in a header comment. That is the convention
worth keeping: the diff says what changed and the comment says why, and in six months only one of
those is still obvious.
