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
  console.log(JSON.stringify({browser:browser.version(),checks:checked,passed:checked-failures.length,failures},null,2));
  assert.equal(failures.length,0,'Native CSS behavior regressions');
}finally{await browser.close();}
