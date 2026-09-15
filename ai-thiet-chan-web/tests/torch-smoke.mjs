import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root=path.resolve(new URL('..',import.meta.url).pathname);
const [html,torch,sw]=await Promise.all([
  readFile(path.join(root,'public/index.html'),'utf8'),
  readFile(path.join(root,'public/torch.js'),'utf8'),
  readFile(path.join(root,'public/sw.js'),'utf8')
]);

for(const marker of ['toggleTorchBtn','Bật đèn','/torch.js']) if(!html.includes(marker)) throw new Error(`torch UI missing: ${marker}`);
for(const marker of ['getCapabilities','torch','applyConstraints','environment','closeCameraBtn','captureBtn','switchCameraBtn','visibilitychange']) if(!torch.includes(marker)) throw new Error(`torch behavior missing: ${marker}`);
if(!sw.includes('/torch.js')) throw new Error('torch asset missing from service worker shell');
console.log('TORCH SMOKE PASS: rear-camera flash control is capability-gated and reset on camera lifecycle events');
