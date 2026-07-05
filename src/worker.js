const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function txt(c) { return [{ text: { content: String(c || '').slice(0, 2000) } }] }
function h2(c) { return { object: 'block', type: 'heading_2', heading_2: { rich_text: txt(c) } } }
function para(c) { return { object: 'block', type: 'paragraph', paragraph: { rich_text: txt(c) } } }
function bullet(c) { return { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: txt(c) } } }
function todo(c) { return { object: 'block', type: 'to_do', to_do: { rich_text: txt(c), checked: false } } }

async function handleNotion(request, env) {
  const NOTION_TOKEN = env.NOTION_TOKEN;
  const NOTION_DB = env.NOTION_DB;

  try {
    const { meeting, summary } = await request.json();
    const blocks = [];

    if (summary?.fullSummary) { blocks.push(h2('📋 전체 요약')); blocks.push(para(summary.fullSummary)) }
    if (summary?.discussions?.length) { blocks.push(h2('💬 주요 논의')); summary.discussions.forEach(d => blocks.push(bullet(typeof d === 'string' ? d : d.content || JSON.stringify(d)))) }
    if (summary?.decisions?.length) { blocks.push(h2('✅ 결정사항')); summary.decisions.forEach(d => blocks.push(bullet(typeof d === 'string' ? d : d.content || JSON.stringify(d)))) }
    if (summary?.actionItems?.length) {
      blocks.push(h2('📌 할 일'));
      summary.actionItems.forEach(a => {
        const text = typeof a === 'string' ? a : `${a.text || ''}${a.assignee ? ` (${a.assignee})` : ''}${a.deadline ? ` - ${a.deadline}까지` : ''}`;
        blocks.push(todo(text));
      });
    }
    if (summary?.schedules?.length) { blocks.push(h2('📅 일정')); summary.schedules.forEach(s => blocks.push(bullet(`${s.title || ''} ${s.date || ''} ${s.time || ''}`.trim()))) }
    if (summary?.issues?.length) { blocks.push(h2('⚠️ 미해결 이슈')); summary.issues.forEach(i => blocks.push(bullet(typeof i === 'string' ? i : JSON.stringify(i)))) }
    if (summary?.keywords?.length) { blocks.push(h2('🔑 키워드')); blocks.push(para(summary.keywords.join(', '))) }

    const title = `${meeting?.title || '회의'} - ${meeting?.date || new Date().toLocaleDateString('ko-KR')} (${meeting?.duration || ''})`;

    const res = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        parent: { database_id: NOTION_DB },
        properties: { Name: { title: [{ text: { content: title } }] } },
        children: blocks,
      }),
    });

    const data = await res.json();
    if (data.object === 'error') throw new Error(data.message);

    return new Response(JSON.stringify({ ok: true, url: data.url }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/notion') {
      if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
      if (request.method === 'POST') return handleNotion(request, env);
    }

    return new Response('Not found', { status: 404 });
  },
};
