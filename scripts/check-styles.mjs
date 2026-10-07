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
try{
  const page=await browser.newPage();
  for(const check of checks){
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
    await page.evaluate(offset=>document.documentElement.style.setProperty('--knife-chat-size-1',`${offset}px`),offset);
    try{
      assert.equal(await page.locator('#message').evaluate(n=>getComputedStyle(n).fontSize),size);
      assert.equal(await page.locator('#nickname').evaluate(n=>getComputedStyle(n).fontSize),size);
      assert.equal(await page.locator('#emoji').evaluate(n=>getComputedStyle(n).height),emoji);
      assert.equal(await page.locator('#foreign-message').evaluate(n=>getComputedStyle(n).fontSize),'14px');
    }catch(error){failures.push({name:`current chat font offset ${offset}`,error:error.message});}
  }
  console.log(JSON.stringify({browser:browser.version(),checks:6,passed:6-failures.length,failures},null,2));
  assert.equal(failures.length,0,'Native CSS behavior regressions');
}finally{await browser.close();}
