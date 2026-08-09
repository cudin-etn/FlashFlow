-- FlashFlow Bảng Vàng schema.
-- Client dùng anon key chỉ được upsert thông tin Telegram công khai và gọi RPC ghi flash.
-- Điểm total_flashes/night_flashes chỉ được thay đổi bởi function SECURITY DEFINER.

create extension if not exists pgcrypto;

create table if not exists public.users (
    telegram_id bigint primary key,
    full_name text not null default 'Vô Danh',
    username text,
    avatar_url text,
    total_flashes integer not null default 0 check (total_flashes >= 0),
    night_flashes integer not null default 0 check (night_flashes >= 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.flash_records (
    id uuid primary key default gen_random_uuid(),
    telegram_id bigint not null references public.users(telegram_id) on delete cascade,
    device_name text not null,
    rom_name text not null,
    flashed_at timestamptz not null default now(),
    is_night boolean not null default false,
    created_at timestamptz not null default now(),
    constraint flash_records_device_name_not_blank check (length(trim(device_name)) > 0),
    constraint flash_records_rom_name_not_blank check (length(trim(rom_name)) > 0)
);

alter table public.users
    add column if not exists full_name text not null default 'Vô Danh',
    add column if not exists username text,
    add column if not exists avatar_url text,
    add column if not exists total_flashes integer not null default 0,
    add column if not exists night_flashes integer not null default 0,
    add column if not exists created_at timestamptz not null default now(),
    add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_users_total_flashes
    on public.users (total_flashes desc, updated_at asc);

create index if not exists idx_users_night_flashes
    on public.users (night_flashes desc, updated_at asc);

create index if not exists idx_flash_records_telegram_id
    on public.flash_records (telegram_id);

create index if not exists idx_flash_records_night_time
    on public.flash_records (is_night, flashed_at desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists users_touch_updated_at on public.users;
create trigger users_touch_updated_at
before update on public.users
for each row execute function public.touch_updated_at();

create or replace view public.leaderboard_top as
select
    telegram_id,
    full_name,
    username,
    avatar_url,
    total_flashes as score,
    night_flashes,
    updated_at
from public.users
where total_flashes > 0
order by total_flashes desc, updated_at asc;

create or replace view public.leaderboard_night as
select
    telegram_id,
    full_name,
    username,
    avatar_url,
    night_flashes as score,
    total_flashes,
    updated_at
from public.users
where night_flashes > 0
order by night_flashes desc, updated_at asc;

create or replace function public.record_flash_success(
    p_telegram_id bigint,
    p_device_name text,
    p_rom_name text,
    p_flashed_at timestamptz default now(),
    p_is_night boolean default false
)
returns public.flash_records
language plpgsql
security definer
set search_path = public
as $$
declare
    inserted_record public.flash_records;
begin
    if p_telegram_id is null or p_telegram_id <= 0 then
        raise exception 'telegram_id is required';
    end if;
    if length(trim(coalesce(p_device_name, ''))) = 0 then
        raise exception 'device_name is required';
    end if;
    if length(trim(coalesce(p_rom_name, ''))) = 0 then
        raise exception 'rom_name is required';
    end if;

    insert into public.users (telegram_id)
    values (p_telegram_id)
    on conflict (telegram_id) do nothing;

    insert into public.flash_records (telegram_id, device_name, rom_name, flashed_at, is_night)
    values (p_telegram_id, trim(p_device_name), trim(p_rom_name), coalesce(p_flashed_at, now()), coalesce(p_is_night, false))
    returning * into inserted_record;

    update public.users
    set total_flashes = total_flashes + 1,
        night_flashes = night_flashes + case when coalesce(p_is_night, false) then 1 else 0 end,
        updated_at = now()
    where telegram_id = p_telegram_id;

    return inserted_record;
end;
$$;

alter table public.users enable row level security;
alter table public.flash_records enable row level security;

drop policy if exists users_select_public on public.users;
create policy users_select_public
on public.users for select
to anon, authenticated
using (true);

drop policy if exists users_insert_profile on public.users;
create policy users_insert_profile
on public.users for insert
to anon, authenticated
with check (telegram_id > 0);

drop policy if exists users_update_profile on public.users;
create policy users_update_profile
on public.users for update
to anon, authenticated
using (telegram_id > 0)
with check (telegram_id > 0);

drop policy if exists flash_records_select_public on public.flash_records;
create policy flash_records_select_public
on public.flash_records for select
to anon, authenticated
using (true);

revoke all on table public.users from anon, authenticated;
revoke all on table public.flash_records from anon, authenticated;
revoke all on function public.record_flash_success(bigint, text, text, timestamptz, boolean) from public;

grant select on table public.users, public.flash_records to anon, authenticated;
grant insert (telegram_id, full_name, username, avatar_url) on table public.users to anon, authenticated;
grant update (full_name, username, avatar_url, updated_at) on table public.users to anon, authenticated;
grant execute on function public.record_flash_success(bigint, text, text, timestamptz, boolean) to anon, authenticated;
grant select on table public.leaderboard_top, public.leaderboard_night to anon, authenticated;
