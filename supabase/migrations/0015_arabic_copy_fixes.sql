-- ============================================================================
-- 0015 — Arabic copy fixes for the APEX Zipline add-on (seeded in 0010)
--   • "310 متراً" → "310 أمتار": 310 ends in ten, so the counted noun is plural.
--   • "الراكبين تحت 16" → "الركّاب دون 16": الراكبين is the dual ("two riders").
-- Only rows still holding the original wording are touched, so any text staff
-- have since edited in /addons is left alone.
-- ============================================================================

update public.bk_addons
   set tagline_ar = replace(tagline_ar, '310 متراً فوق الوادي', '310 أمتار فوق الوادي')
 where slug = 'apex-zipline' and tagline_ar like '%310 متراً فوق الوادي%';

update public.bk_addons
   set note_hint_ar = replace(note_hint_ar, 'وعدد الراكبين تحت 16 عاماً', 'وعدد الركّاب دون 16 عاماً')
 where slug = 'apex-zipline' and note_hint_ar like '%وعدد الراكبين تحت 16 عاماً%';
