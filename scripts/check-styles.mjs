// Native CSS regression checks in a fresh, synthetic browser profile.
// No installed extension, user settings, broadcast or chat content is used.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true,...(process.argv.includes('--chrome')?{channel:'chrome'}:{})});
const fixture=`<style>body{margin:0}a,ul,div{display:block}.message{font-size:14px}img{width:24px;height:24px}</style>
<header id="header"><a id="studio" href="https://studio.chzzk.naver.com/example">Studio</a><a id="legacy-studio" class="toolbar_studio_button__old" href="/legacy-studio">Legacy studio</a>
<ul id="topics" class="_list_w2gsx_20"><li><a href="/home/game/HOME">Game</a></li></ul>
<ul id="legacy-topics" class="topic_tab_tab_list__old"><li>Legacy topics</li></ul>
<ul id="other-header-list"><li><a href="/following">Following</a></li></ul></header>
<a id="foreign-studio" href="https://studio.chzzk.naver.com/other">Unrelated content</a>
<ul id="foreign-topics"><li><a href="/home/game/HOME">Unrelated list</a></li></ul>
<aside id="sidebar"><ul><li id="offline-row" class="_item_qz74s_107"><div id="offline" class="_item_bwftz_57 _type_profile_bwftz_84"><div class="_profile_bwftz_70"></div><a href="/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa">Offline</a></div></li></ul>
<div id="live" class="_item_bwftz_57 _type_profile_bwftz_84"><div class="_profile_bwftz_70 _is_live_bwftz_174"></div><a href="/live/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb">Live</a></div>
<div id="schedule" class="_item_bwftz_57 _type_schedule_bwftz_99"><a href="/cccccccccccccccccccccccccccccccc">Scheduled</a></div></aside>
<div id="legacy-offline" class="navigator_type_profile__old">Legacy offline</div><div id="legacy-live" class="navigator_type_profile__old"><span class="navigator_is_live__old">Live</span></div>
<div id="foreign-profile" class="_item_current _type_profile_current"><a href="/other">Unrelated profile</a></div>
<aside id="aside-chatting"><div role="log"><div class="_item_8lqsk_7">
<div id="message" class="_chatting_message_w9pvh_21 message">Synthetic message<img id="emoji" alt=""></div>
<span id="nickname" class="_nickname_w9pvh_33 message">Name</span></div></div></aside>
<div id="foreign-message" class="_chatting_message_other message">Unrelated text</div>`;
const checks=[
  {name:'hide-studio targets current header button without hiding content links',file:'hide-studio',hidden:['studio','legacy-studio'],visible:['foreign-studio']},
  {name:'hide-topics targets current topic list without hiding other lists',file:'hide-topics',hidden:['topics','legacy-topics'],visible:['other-header-list','foreign-topics']},
  {name:'hide-offline hides only sidebar offline profile rows',file:'hide-offline',hidden:['offline','offline-row','legacy-offline'],visible:['live','schedule','foreign-profile','legacy-live']},
];
const failures=[];
let checked=0;
const checkNative=async(name,fn)=>{checked++;try{await fn();}catch(error){failures.push({name,error:error.message});}};
try{
  const page=await browser.newPage();
  for(const check of checks){
    checked++;
    await page.setContent(fixture);
    await page.addStyleTag({content:await fs.readFile(`styles/${check.file}.css`,'utf8')});
    try{
      for(const id of check.hidden)assert.equal(await page.locator(`#${id}`).evaluate(n=>getComputedStyle(n).display),'none',`${id} must hide`);
      for(const id of check.visible)assert.notEqual(await page.locator(`#${id}`).evaluate(n=>getComputedStyle(n).display),'none',`${id} must stay visible`);
    }catch(error){failures.push({name:check.name,error:error.message});}
  }
  await page.setContent(fixture);
  await page.addStyleTag({content:await fs.readFile('styles/chat-font-size.css','utf8')});
  for(const [offset,size,emoji] of [[-6,'8px','18px'],[0,'14px','24px'],[8,'22px','32px']]){
    checked++;
    await page.evaluate(offset=>document.documentElement.style.setProperty('--knife-chat-size-1',`${offset}px`),offset);
    try{
      assert.equal(await page.locator('#message').evaluate(n=>getComputedStyle(n).fontSize),size);
      assert.equal(await page.locator('#nickname').evaluate(n=>getComputedStyle(n).fontSize),size);
      assert.equal(await page.locator('#emoji').evaluate(n=>getComputedStyle(n).height),emoji);
      assert.equal(await page.locator('#foreign-message').evaluate(n=>getComputedStyle(n).fontSize),'14px');
    }catch(error){failures.push({name:`current chat font offset ${offset}`,error:error.message});}
  }
  const currentFixture=`<style>body{margin:0;--color-content-02:#fff}#sidebar{position:fixed;left:0;top:60px;width:78px}#sidebar._is_expanded_test{width:240px}#layout-body{box-sizing:border-box;width:100%;padding-left:78px}#layout-body._is_expanded_test{padding-left:240px}.round,img.avatar{border-radius:50%}#header{height:60px}#header img{width:85px;height:26px}</style>
    <header id="header"><div><button id="menu">Menu</button><h1><img id="logo" class="_logo_chzzk_test" alt="Logo"></h1></div><div class="_section_test"></div></header>
    <aside id="sidebar"><div id="sidebar-profile" class="_profile_test round"><img id="sidebar-avatar" class="avatar"></div></aside>
    <main id="layout-body"><a id="profile" class="_image_test round" href="/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"><img id="profile-avatar" style="border-radius:50%"></a>
    <a id="video-thumb" class="_thumbnail_test round" href="/video/123"><img class="avatar"></a>
    <em id="live-badge" class="_container_test _live_test _is_on_test _badge_test">LIVE</em><em id="vod-badge" class="_container_test _badge_test">VOD</em></main>
    <div id="foreign-profile" class="_profile_test round"></div><img id="foreign-logo" class="_logo_chzzk_test" style="width:85px">`;
  await checkNative('static-logo replaces only the header image',async()=>{
    await page.setContent(currentFixture);await page.addStyleTag({content:await fs.readFile('styles/static-logo.css','utf8')});
    const logo=await page.locator('#logo').evaluate(n=>({width:getComputedStyle(n).width,mask:getComputedStyle(n).maskImage}));
    assert.equal(logo.width,'0px');assert.notEqual(logo.mask,'none');
    assert.equal(await page.locator('#foreign-logo').evaluate(n=>getComputedStyle(n).maskImage),'none');
  });
  await checkNative('rectangle-profile squares profile wrapper and image, not video cards or foreign content',async()=>{
    await page.setContent(currentFixture);await page.addStyleTag({content:await fs.readFile('styles/rectangle-profile.css','utf8')});
    for(const id of ['profile','profile-avatar','sidebar-profile','sidebar-avatar'])assert.equal(await page.locator(`#${id}`).evaluate(n=>getComputedStyle(n).borderRadius),'0px',id);
    for(const id of ['video-thumb','foreign-profile'])assert.equal(await page.locator(`#${id}`).evaluate(n=>getComputedStyle(n).borderRadius),'50%',id);
  });
  await checkNative('hide-live-badge leaves non-live badges visible',async()=>{
    await page.setContent(currentFixture);await page.addStyleTag({content:await fs.readFile('styles/hide-live-badge.css','utf8')});
    assert.equal(await page.locator('#live-badge').evaluate(n=>getComputedStyle(n).display),'none');
    assert.notEqual(await page.locator('#vod-badge').evaluate(n=>getComputedStyle(n).display),'none');
  });
  for(const [width,expanded,padding,sidebarLeft] of [[1600,true,'240px',1360],[1600,false,'78px',1522],[1100,false,'78px',1022]])await checkNative(`right-sidebar viewport ${width}, expanded=${expanded}`,async()=>{
    await page.setViewportSize({width,height:900});await page.setContent(currentFixture);
    if(expanded)await page.evaluate(()=>{document.querySelector('#sidebar').classList.add('_is_expanded_test');document.querySelector('#layout-body').classList.add('_is_expanded_test');});
    await page.addStyleTag({content:await fs.readFile('styles/right-sidebar.css','utf8')});
    assert.equal(await page.locator('#sidebar').evaluate(n=>n.getBoundingClientRect().left),sidebarLeft);
    assert.deepEqual(await page.locator('#layout-body').evaluate(n=>({left:getComputedStyle(n).paddingLeft,right:getComputedStyle(n).paddingRight})),{left:'0px',right:padding});
  });
  const vodFixture='<style>#layout-body>div{display:flex;flex-direction:row}#vod-aside{width:353px}._chatting_message_test{font-size:14px}</style><main id="layout-body"><div><section>Player</section><aside id="vod-aside" class="_aside_test"><div role="log"><div class="_chatting_message_test">Synthetic</div></div></aside></div></main>';
  await checkNative('VOD resize uses the stored chat width',async()=>{
    await page.setContent(vodFixture);await page.addStyleTag({content:await fs.readFile('styles/chat-resize.css','utf8')});
    await page.evaluate(()=>document.documentElement.style.setProperty('--knife-chat-width','420px'));
    assert.equal(await page.locator('#vod-aside').evaluate(n=>getComputedStyle(n).width),'420px');
  });
  await checkNative('VOD chat font matches live font parameters',async()=>{
    await page.setContent(vodFixture);await page.addStyleTag({content:await fs.readFile('styles/chat-font-size.css','utf8')});
    await page.evaluate(()=>document.documentElement.style.setProperty('--knife-chat-size-1','8px'));
    assert.equal(await page.locator('#vod-aside ._chatting_message_test').evaluate(n=>getComputedStyle(n).fontSize),'22px');
  });
  await checkNative('VOD left-chat reverses only the player/chat row',async()=>{
    await page.setContent(vodFixture);await page.addStyleTag({content:await fs.readFile('styles/left-chat.css','utf8')});
    assert.equal(await page.locator('#vod-aside').evaluate(n=>getComputedStyle(n.parentElement).flexDirection),'row-reverse');
  });
  await checkNative('live left-chat reverses the outer chat row without shrinking the inner player main',async()=>{
    await page.setViewportSize({width:1200,height:900});
    await page.setContent('<style>#layout-body>div{display:flex;width:1000px}main{display:flex;flex-direction:column;flex:1;min-width:0}.contents{min-width:60px}.player{height:300px;width:100%}#aside-chatting{width:200px;flex:none}</style><div id="layout-body"><div><main class="_container_live"><div class="contents"><div id="live_player_layout" class="player"></div></div></main><aside id="aside-chatting"></aside></div></div><main id="foreign-main" class="_container_unrelated"><div>Other view</div></main>');
    await page.addStyleTag({content:await fs.readFile('styles/left-chat.css','utf8')});
    assert.equal(await page.locator('#live_player_layout').evaluate(n=>n.getBoundingClientRect().width),800,'player retains full remaining width');
    assert.equal(await page.locator('#aside-chatting').evaluate(n=>getComputedStyle(n.parentElement).flexDirection),'row-reverse');
    assert.equal(await page.locator('#foreign-main').evaluate(n=>getComputedStyle(n).flexDirection),'column','other main containers stay unchanged');
  });
  const exploreFixture='<style>body{margin:0}#sidebar{position:fixed;left:0;top:60px;width:240px}#sidebar ._content_current{position:relative;padding:4px 20px}nav{padding-bottom:15px}ul{display:block;margin:0;padding:0;list-style:none}li{margin-top:3px}a{display:block;white-space:nowrap}#layout-body{padding-left:240px}</style><aside id="sidebar" class="_container_current _is_expanded_current" aria-label="사이드바"><div class="_wrapper_current"><div class="_content_current"><nav id="explore" class="_section_current _is_expanded_current"><ul id="explore-list" class="_list_current"><li class="_item_current"><a href="/lives">Live</a></li><li class="_item_current"><a href="/clips">Clips</a></li><li class="_item_current"><a href="/category">Categories</a></li></ul></nav><nav id="following" class="_section_current"><ul id="following-list" class="_list_current"><li>Following</li></ul></nav></div></div></aside><main id="layout-body" class="_is_expanded_current"></main><nav id="foreign-explore"><ul id="foreign-list"><li>Other</li></ul></nav>';
  for(const [width,right] of [[1800,false],[1800,true],[1799,false],[1100,false]])await checkNative(`top-explore current first section width ${width}, right=${right}`,async()=>{
    await page.setViewportSize({width,height:900});await page.setContent(exploreFixture);
    if(right)await page.addStyleTag({content:await fs.readFile('styles/right-sidebar.css','utf8')});
    await page.addStyleTag({content:await fs.readFile('styles/top-explore.css','utf8')});
    const nav=await page.locator('#explore').evaluate(n=>({position:getComputedStyle(n).position,x:n.getBoundingClientRect().x,y:n.getBoundingClientRect().y}));
    assert.equal(nav.position,width>=1800?'absolute':'static','only wide view moves the first section');
    assert.equal(await page.locator('#explore-list').evaluate(n=>getComputedStyle(n).display),width>=1800?'flex':'block');
    if(width>=1800){assert.ok(nav.x>=0&&nav.x<width,'top navigation remains within viewport');assert.ok(nav.y>=0&&nav.y<60,'top navigation reaches toolbar row');}
    for(const id of ['following','foreign-explore'])assert.equal(await page.locator(`#${id}`).evaluate(n=>getComputedStyle(n).position),'static',id);
    for(const id of ['following-list','foreign-list'])assert.equal(await page.locator(`#${id}`).evaluate(n=>getComputedStyle(n).display),'block',id);
  });
  for(const width of [1800,1799,1100])await checkNative(`top-explore keeps promotional farm out of toolbar only at wide breakpoint ${width}`,async()=>{
    await page.setViewportSize({width,height:900});
    await page.setContent(exploreFixture.replace('</ul>','<li id="farm"><a href="/cheezefarm">Promotional farm</a></li></ul>')+'<a id="foreign-farm" href="/cheezefarm">Unrelated farm link</a>');
    await page.addStyleTag({content:await fs.readFile('styles/top-explore.css','utf8')});
    assert.equal(await page.locator('#farm').evaluate(n=>getComputedStyle(n).display),width>=1800?'none':'list-item');
    assert.notEqual(await page.locator('#explore-list>li').first().evaluate(n=>getComputedStyle(n).display),'none','ordinary navigation remains visible');
    assert.notEqual(await page.locator('#foreign-farm').evaluate(n=>getComputedStyle(n).display),'none','no global farm-link hiding');
  });
  const toolbarFixture='<style>body{margin:0}header{position:sticky;top:0;height:60px;transform:translateY(0)}#layout-body{min-height:900px}#sidebar{position:fixed;top:60px}</style><div class="_glive_current"><header id="header" aria-label="헤더" style="transform:translateY(0px)"><input id="search" aria-label="Search"></header><aside id="sidebar" aria-label="사이드바"><nav><a id="nav-link" href="/lives">Live</a></nav></aside><main id="layout-body"></main></div>';
  await checkNative('auto-hide collapses current sticky header and reveals it on hover',async()=>{
    await page.setViewportSize({width:1600,height:900});await page.setContent(toolbarFixture);await page.mouse.move(1100,400);
    await page.addStyleTag({content:await fs.readFile('styles/auto-hide-toolbar.css','utf8')});
    await page.waitForFunction(()=>Math.abs(document.querySelector('#header').getBoundingClientRect().y+45)<0.1,{},{timeout:2000});
    assert.equal(Math.round(await page.locator('#header').evaluate(n=>n.getBoundingClientRect().y)),-45,'collapsed toolbar leaves a 15px hover strip');
    await page.mouse.move(500,5);
    await page.waitForFunction(()=>Math.abs(document.querySelector('#header').getBoundingClientRect().y)<0.1,{},{timeout:2000});
    assert.ok(Math.abs(await page.locator('#header').evaluate(n=>n.getBoundingClientRect().y))<0.1,'expanded toolbar returns to top');
  });
  await checkNative('auto-hide reveals current toolbar for keyboard focus without hover',async()=>{
    await page.setContent(toolbarFixture);await page.mouse.move(1100,400);await page.locator('#search').focus();
    await page.addStyleTag({content:await fs.readFile('styles/auto-hide-toolbar.css','utf8')});
    assert.equal(await page.locator('#header').evaluate(n=>n.matches(':hover')),false);
    assert.equal(Math.round(await page.locator('#header').evaluate(n=>n.getBoundingClientRect().y)),0,'focused search remains visible');
    assert.equal(await page.locator('._glive_current').evaluate(n=>getComputedStyle(n).getPropertyValue('--knife-top-explore-top').trim()),'-11px','top-explore follows keyboard focus');
  });
  await checkNative('top-explore follows auto-hide offset and returns on keyboard focus',async()=>{
    await page.setViewportSize({width:1800,height:900});
    await page.setContent(toolbarFixture.replace('<aside id="sidebar"','<aside class="_container_current _is_expanded_current" id="sidebar"'));await page.mouse.move(1100,400);
    await page.addStyleTag({content:await fs.readFile('styles/auto-hide-toolbar.css','utf8')});
    await page.addStyleTag({content:await fs.readFile('styles/top-explore.css','utf8')});
    assert.ok(await page.locator('#sidebar nav').evaluate(n=>n.getBoundingClientRect().bottom<=15),'navigation must not stay over the collapsed toolbar');
    await page.locator('#search').focus();
    await page.waitForFunction(()=>{const y=document.querySelector('#sidebar nav').getBoundingClientRect().y;return y>=0&&y<15},{},{timeout:2000});
    assert.ok(await page.locator('#sidebar nav').evaluate(n=>n.getBoundingClientRect().y>=0),'focused header exposes navigation');
  });
  const searchFixture=`<style>body{margin:0}#header{height:60px;display:flex;align-items:center;padding:0 20px;position:relative;box-sizing:border-box}.logo{width:129px;flex:none}.tools{display:flex;flex:1;justify-content:space-between;align-items:center}.topics{width:244.5px;height:40px;flex:none}.search{position:absolute;left:50%;transform:translateX(-50%);width:400px;height:38px}form{margin:0}input{box-sizing:border-box;width:100%}._section_controls{width:340px;height:40px;flex:none}#sidebar{position:fixed;top:60px;left:0;width:240px}._content_current{position:relative;padding:4px 20px}nav{padding-bottom:15px}ul{margin:0;padding:0;list-style:none}li{flex-shrink:0;height:38px}li:nth-child(1),li:nth-child(2){width:111.9375px}li:nth-child(3){width:108.65625px}li:nth-child(4){width:104px}li:nth-child(5){width:96px}#layout-body{padding-left:240px}</style>
    <header id="header"><div class="logo">Logo</div><div class="tools"><div class="topics">Topics</div><div id="search-container" class="search"><form><div><input id="search-input" aria-label="Search"></div></form></div><div id="controls" class="_section_controls">Account controls</div></div></header>
    <aside id="sidebar" class="_container_current _is_expanded_current"><div class="_content_current"><nav id="explore"><ul><li>Live</li><li>Clips</li><li>Category</li><li>Schedule</li><li>Following</li></ul></nav><nav id="following">Following channels</nav></div></aside><main id="layout-body"></main><div><form><input id="foreign-search"></form></div>`;
  for(const [width,right] of [[1200,false],[1799,false],[1800,false],[1920,false],[2560,false],[1800,true],[1920,true]])await checkNative(`top-explore avoids search and account overlap at ${width}, right=${right}`,async()=>{
    await page.setViewportSize({width,height:900});await page.setContent(searchFixture);
    if(right)await page.addStyleTag({content:await fs.readFile('styles/right-sidebar.css','utf8')});
    const baseline=await page.locator('#search-container').evaluate(n=>n.getBoundingClientRect().x);
    const css=await page.addStyleTag({content:await fs.readFile('styles/top-explore.css','utf8')});
    const layout=await page.evaluate(()=>({nav:document.querySelector('#explore').getBoundingClientRect().toJSON(),search:document.querySelector('#search-container').getBoundingClientRect().toJSON(),controls:document.querySelector('#controls').getBoundingClientRect().toJSON(),position:getComputedStyle(document.querySelector('#explore')).position}));
    if(width>=1800){
      assert.ok(layout.nav.right+8<=layout.search.left,'search stays beyond navigation');
      assert.ok(layout.search.right+8<=layout.controls.left,'search stays before account controls');
      assert.ok(layout.nav.y>=0&&layout.nav.bottom<=60,'menu fits toolbar');
      assert.ok(layout.search.width>=300,'search remains usable');
    }else{
      assert.equal(layout.position,'static','narrow view keeps sidebar navigation');
      assert.equal(layout.search.x,baseline,'narrow view keeps native search placement');
    }
    assert.equal(await page.locator('#foreign-search').evaluate(n=>getComputedStyle(n.parentElement.parentElement).position),'static');
    await css.evaluate(n=>n.remove());
    assert.equal(await page.locator('#search-container').evaluate(n=>getComputedStyle(n).position),'absolute','removing option restores native search');
    assert.equal(await page.locator('#search-container').evaluate(n=>n.getBoundingClientRect().x),baseline);
  });
  const homeFixture='<style>section{display:block}ul{height:40px}</style><main id="layout-body" data-knife-home="1"><section id="recommended"><ul class="_grid_current _is_two_columns_current"><li>Recommended</li></ul></section><section id="following"><ul class="_list_current _type_vod_current"><li>Following</li></ul></section><section id="recent-vod"><ul class="_list_current _type_vod_current"><li>Recent VOD</li></ul></section><section id="other-grid"><ul class="_grid_current"><li>Other layout</li></ul></section><section id="nested-grid"><div><ul class="_grid_current _is_two_columns_current"><li>Nested unrelated layout</li></ul></div></section></main><section id="foreign-grid"><ul class="_grid_current _is_two_columns_current"><li>Outside home content</li></ul></section><div id="legacy-recommended" class="home_recommend_live_container__old">Legacy recommendations</div>';
  await checkNative('hide-recommended-live hides only the current home recommendation section',async()=>{
    await page.setContent(homeFixture);await page.addStyleTag({content:await fs.readFile('styles/hide-recommended-live.css','utf8')});
    for(const id of ['recommended','legacy-recommended'])assert.equal(await page.locator(`#${id}`).evaluate(n=>getComputedStyle(n).display),'none',id);
    for(const id of ['following','recent-vod','other-grid','nested-grid','foreign-grid'])assert.notEqual(await page.locator(`#${id}`).evaluate(n=>getComputedStyle(n).display),'none',id);
  });
  await checkNative('hide-recommended-live leaves unmarked routes visible',async()=>{
    await page.setContent(homeFixture.replace(' data-knife-home="1"',''));await page.addStyleTag({content:await fs.readFile('styles/hide-recommended-live.css','utf8')});
    assert.notEqual(await page.locator('#recommended').evaluate(n=>getComputedStyle(n).display),'none');
    assert.equal(await page.locator('#legacy-recommended').evaluate(n=>getComputedStyle(n).display),'none','legacy home layout remains supported');
  });
  await checkNative('removing recommendation style restores the current home section',async()=>{
    await page.setContent(homeFixture);const css=await page.addStyleTag({content:await fs.readFile('styles/hide-recommended-live.css','utf8')});
    await css.evaluate(n=>n.remove());
    assert.notEqual(await page.locator('#recommended').evaluate(n=>getComputedStyle(n).display),'none');
  });
  console.log(JSON.stringify({browser:browser.version(),checks:checked,passed:checked-failures.length,failures},null,2));
  assert.equal(failures.length,0,'Native CSS behavior regressions');
}finally{await browser.close();}
