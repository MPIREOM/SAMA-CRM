-- 0012: campaigns can send an approved Meta template (marketing) instead of free
-- text squeezed into the generic re-engage template. The template itself lives
-- in Meta; the campaign stores which one and how its variables are filled.
alter table public.campaigns
  add column if not exists wa_template_name     text,
  add column if not exists wa_template_language text,   -- 'auto' = guest's language with fallback
  add column if not exists wa_template_params   jsonb;

comment on column public.campaigns.wa_template_name     is 'Meta template name; null = free-text campaign';
comment on column public.campaigns.wa_template_language is 'auto | en | ar … (auto picks the guest''s language)';
comment on column public.campaigns.wa_template_params   is 'TemplateParamPlan: header media URL, body variable sources, button URL suffixes';

-- Public bucket for template sample media and campaign header media. Meta
-- fetches header media by public URL at send time.
insert into storage.buckets (id, name, public)
values ('wa-media', 'wa-media', true)
on conflict (id) do nothing;

drop policy if exists wa_media_public_read on storage.objects;
create policy wa_media_public_read on storage.objects
  for select to anon, authenticated using (bucket_id = 'wa-media');
drop policy if exists wa_media_staff_write on storage.objects;
create policy wa_media_staff_write on storage.objects
  for insert to authenticated with check (bucket_id = 'wa-media' and public.my_role() = 'super_admin');
drop policy if exists wa_media_staff_delete on storage.objects;
create policy wa_media_staff_delete on storage.objects
  for delete to authenticated using (bucket_id = 'wa-media' and public.my_role() = 'super_admin');
