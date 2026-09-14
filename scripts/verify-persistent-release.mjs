import {execFileSync,spawnSync} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const output=new URL('../output/persistent-release-v090/',import.meta.url);
await mkdir(output,{recursive:true});
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const sourceHead=git('rev-parse','HEAD');
if(git('status','--porcelain'))throw new Error('Release verification requires a clean committed worktree.');
const checks=[];
for(const [name,command,args] of [['tests',process.execPath,['--test','--test-reporter=spec',...git('ls-files','tests/*.test.mjs').split('\n')]],['typecheck','npm',['run','typecheck']],['build','npm',['run','build:remote']],['browser',process.execPath,['scripts/verify-persistent-browser.mjs']]]) {
  const result=spawnSync(command,args,{cwd:root,encoding:'utf8',maxBuffer:4_000_000,env:{...process.env,WRANGLER_SEND_METRICS:'false',WRANGLER_LOG_PATH:fileURLToPath(new URL('wrangler-build.log',output))}});
  await writeFile(new URL(`${name}.log`,output),`Source HEAD: ${sourceHead}\nCommand: ${command} ${args.join(' ')}\nExit: ${result.status}\n${result.stdout??''}\n${result.stderr??''}`);
  checks.push({name,exitCode:result.status,log:`${name}.log`});
  if(result.status!==0)break;
}
const widget=await readFile(new URL('../dist/widget.html',import.meta.url));
const manifest={sourceHead,sourceStillClean:git('status','--porcelain')==='',sourceStillSame:git('rev-parse','HEAD')===sourceHead,checkedAt:new Date().toISOString(),checks,widgetBytes:widget.length,widgetSha256:createHash('sha256').update(widget).digest('hex'),boundary:'Local source, build and controlled-browser evidence; PDFs in this browser harness are stubs. Actual host journeys and remote PDF delivery are separate.'};
await writeFile(new URL('evidence.json',output),JSON.stringify(manifest,null,2));
if(checks.length!==4||checks.some(check=>check.exitCode!==0)||!manifest.sourceStillClean||!manifest.sourceStillSame)throw new Error('Release checks failed; inspect their recorded output.');
console.log(JSON.stringify(manifest));
