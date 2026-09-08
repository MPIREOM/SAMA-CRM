-- 0011: Google Maps link — the owner's short link replaces the long place URL from the seed (0006).
-- Guest pages, the confirmation/manage pages, the .ics file and the pre-arrival messages all read
-- settings.contact.maps_link, so one row update changes them everywhere. Staff can still edit it in /settings.
update public.bk_settings
set value      = jsonb_set(value, '{maps_link}', to_jsonb('https://maps.app.goo.gl/YC7RXydtYz61cFZj9'::text)),
    updated_at = now()
where key = 'contact';
