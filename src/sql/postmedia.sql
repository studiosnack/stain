-- join.sql
select 
  posts.id as post_id, 
  posts.title as post_title, 
  posts.created_on as post_created_on,
  posts.metadata as post_meta,

  mediapost.value as media_id,

  mediadata.created_on as m_co,
  mediadata.uri as media_uri,
  mediadata.title as media_title,
  mediadata.caption as media_caption
  --mediadata.
from 
  posts, 
  json_each(posts.media) as mediapost 
left join media as mediadata
  on media_id = mediadata.id
where posts.id='UEApm';
