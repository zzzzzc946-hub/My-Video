from pathlib import Path
import argparse,json,subprocess,os,re,time,signal,urllib.request,tempfile
parser=argparse.ArgumentParser(description='Export synthetic media and check the installed local API without paid services.')
parser.add_argument('--skill',type=Path,required=True)
args=parser.parse_args()
skill=args.skill.expanduser().resolve();runtime=skill/'assets/runtime'
temporary=tempfile.TemporaryDirectory(prefix='max-share-smoke-')
root=Path(temporary.name);task=root/'synthetic-task';task.mkdir()
source=task/'source clip.mp4'
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=c=0x345678:s=1080x1920:r=24:d=2.4','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=2.4','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-shortest',str(source)],check=True)
(task/'edl.json').write_text(json.dumps({'version':1,'sources':{'source':str(source.resolve())},'ranges':[{'source':'source','start':0.1,'end':0.8},{'source':'source','start':1.0,'end':1.7}],'grade':'none','output_fps':30,'total_duration_s':1.4}))
handle=tempfile.NamedTemporaryFile(prefix='.max-share-smoke-',suffix='.ts',dir=runtime,delete=False)
script=Path(handle.name);handle.close()
script.write_text('''import {openProject} from "./workbench/server/repository.ts";
import {renderFinalVideoUse} from "./workbench/server/exporters.ts";
async function main(){
const root=process.argv[2];
const project=await openProject(root,{draftMode:"new"});
const result=await renderFinalVideoUse(root,project,{title:"share-smoke",format:"mp4",resolution:"1080p",frameRate:30,quality:"standard"},root+"/export.log");
console.log(JSON.stringify(result));
}main().catch(error=>{console.error(error);process.exitCode=1;});
''')
try:
    result=subprocess.run(['node','--import','tsx',str(script),str(task)],cwd=runtime,capture_output=True,text=True)
    if result.returncode: raise RuntimeError(result.stdout+'\n'+result.stderr)
    exported=json.loads(result.stdout.strip().splitlines()[-1]);output=Path(exported['outputPath'])
    probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(output)]))
    video=next(s for s in probe['streams'] if s['codec_type']=='video')
    assert (video['width'],video['height'],video['avg_frame_rate'])==(1080,1920,'30/1'),video
    assert abs(float(probe['format']['duration'])-1.4)<0.15,probe['format']['duration']
    assert any(s['codec_type']=='audio' for s in probe['streams'])
    print('SYNTHETIC_EXPORT_PASS',json.dumps({'resolution':[video['width'],video['height']],'fps':video['avg_frame_rate'],'duration':probe['format']['duration']},ensure_ascii=False))
finally: script.unlink(missing_ok=True)
# Launch installed copy; check HTTP API and frontend without browser automation.
logpath=root/'workbench-start.log'
with logpath.open('w') as log:
    process=subprocess.Popen(['python3',str(skill/'scripts/workbench.py')],stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
    try:
        for _ in range(100):
            text=logpath.read_text()
            match=re.search(r'api=(http://127\.0\.0\.1:\d+) web=(http://127\.0\.0\.1:\d+)',text)
            if match:
                try:
                    health=json.load(urllib.request.urlopen(match[1]+'/api/health',timeout=2))
                    html=urllib.request.urlopen(match[2],timeout=2).read().decode()
                    assert health['ok'] is True and 'id="root"' in html and 'main.tsx' in html
                    print('LOCAL_API_AND_FRONTEND_PASS');break
                except OSError: pass
            if process.poll() is not None: raise RuntimeError(text)
            time.sleep(0.2)
        else: raise RuntimeError(logpath.read_text())
    finally:
        os.killpg(process.pid,signal.SIGTERM)
        try: process.wait(timeout=5)
        except subprocess.TimeoutExpired: os.killpg(process.pid,signal.SIGKILL);process.wait()
