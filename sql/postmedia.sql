-- join.sql
select 
  posts.id as post_id, 
  posts.title as post_title, 
  posts.created_on as p_co, 
  posts.metadata as post_meta,
  mediadata.created_on as m_co,
  mediapost.value as media_id, 
  mediadata.uri as media_uri
  --mediadata.
from 
  posts, 
  json_each(posts.media) as mediapost 
left outer join media as mediadata 
  on mediapost.value = mediadata.id 
where posts.id='ogbnK'
