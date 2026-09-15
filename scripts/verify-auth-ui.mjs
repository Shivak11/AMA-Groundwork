import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {renderAuthPage} from '../remote/auth-page.mjs';

const output=new URL('../output/auth-ui/',import.meta.url);
const screens=new URL('screens/',output);
await mkdir(screens,{recursive:true});
const browser=await chromium.launch({headless:true});
const checks=[];

async function capture({name,width,height=900,colorScheme='light',view='signin',user=null,error=''}) {
  const page=await browser.newPage({viewport:{width,height}});
  try{
    await page.emulateMedia({colorScheme});
    await page.setContent(renderAuthPage({clientName:'Claude',view,user,error}));
    const metrics=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,buttons:[...document.querySelectorAll('button')].map(button=>button.textContent.trim()),title:document.querySelector('h1')?.textContent}));
    assert(metrics.scrollWidth<=metrics.clientWidth,`${name} has horizontal overflow.`);
    assert(metrics.buttons.includes('Cancel'),`${name} does not provide a cancel action.`);
    assert.equal(await page.locator('main').count(),1);
    assert.equal(await page.locator('form').count(),1);
    await page.screenshot({path:fileURLToPath(new URL(`${name}.png`,screens)),fullPage:true});
    checks.push({name,colorScheme,width,title:metrics.title,buttons:metrics.buttons,horizontalOverflow:false});
  }finally{await page.close();}
}

try{
  await capture({name:'desktop-sign-in-light',width:1280});
  await capture({name:'desktop-create-account-dark',width:1280,colorScheme:'dark',view:'create'});
  await capture({name:'mobile-sign-in-light',width:390,height:844});
  await capture({name:'mobile-continue-dark',width:390,height:844,colorScheme:'dark',user:{displayName:'Shiva',email:'shiva@example.com'}});
  await capture({name:'mobile-error-light',width:390,height:844,error:'The email address or password is incorrect.'});
}finally{await browser.close();}

await writeFile(new URL('evidence.json',output),JSON.stringify({result:'pass',createdAt:new Date().toISOString(),checks,boundary:'Controlled local Chromium and generated account HTML only. This verifies layout, controls and light and dark rendering. It does not prove a deployed OAuth exchange or native ChatGPT and Claude behaviour.'},null,2));
console.log(JSON.stringify({result:'pass',screens:checks.length,output:fileURLToPath(output)}));
