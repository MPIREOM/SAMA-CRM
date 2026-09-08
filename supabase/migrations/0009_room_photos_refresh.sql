-- ============================================================================
-- SAMA — Migration 0009 — Room-type photo refresh (owner supplied new photos
-- on 2026-09-08). Data-only; files live under public/images/rooms/<slug>/.
-- ============================================================================
update public.bk_room_types set images = case slug
  when 'chalet' then array['/images/rooms/chalet/1.jpg','/images/rooms/chalet/2.jpg','/images/rooms/chalet/3.jpg','/images/rooms/chalet/4.jpg','/images/rooms/chalet/5.jpg','/images/rooms/chalet/6.jpg']
  when 'deluxe-mountain-view' then array['/images/rooms/deluxe-mountain-view/1.jpg','/images/rooms/deluxe-mountain-view/2.jpg','/images/rooms/deluxe-mountain-view/3.jpg','/images/rooms/deluxe-mountain-view/4.jpg']
  when 'deluxe-city-view' then array['/images/rooms/deluxe-city-view/1.jpg','/images/rooms/deluxe-city-view/2.jpg','/images/rooms/deluxe-city-view/3.jpg','/images/rooms/deluxe-city-view/4.jpg']
  when 'family-deluxe' then array['/images/rooms/family-deluxe/1.jpg','/images/rooms/family-deluxe/2.jpg','/images/rooms/family-deluxe/3.jpg','/images/rooms/family-deluxe/4.jpg','/images/rooms/family-deluxe/5.jpg']
  when 'sama-suite-city-view' then array['/images/rooms/sama-suite-city-view/1.jpg','/images/rooms/sama-suite-city-view/2.jpg','/images/rooms/sama-suite-city-view/3.jpg','/images/rooms/sama-suite-city-view/4.jpg']
  when 'sama-suite-mountain-view' then array['/images/rooms/sama-suite-mountain-view/1.jpg','/images/rooms/sama-suite-mountain-view/2.jpg','/images/rooms/sama-suite-mountain-view/3.jpg','/images/rooms/sama-suite-mountain-view/4.jpg']
  else images end
where slug in ('chalet','deluxe-mountain-view','deluxe-city-view','family-deluxe','sama-suite-city-view','sama-suite-mountain-view');
