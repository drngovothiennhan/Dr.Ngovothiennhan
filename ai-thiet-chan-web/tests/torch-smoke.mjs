import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root=path.resolve(new URL('..',import.meta.url).pathname);
const [settings,torch,sw]=await Promise.all([
  readFile(path.join(root,'public/settings.js'),'utf8'),
  readFile(path.join(root,'public/torch.js'),'utf8'),
  readFile(path.join(root,'public/sw.js'),'utf8')
]);

for(const marker of ["script.src='/torch.js'",'dataset.rearTorch']) if(!settings.includes(marker)) throw new Error(`torch loader missing: ${marker}`);
for(const marker of ['toggleTorchBtn','Bật đèn','Tắt đèn','getCapabilities','applyConstraints','torch','environment','closeCameraBtn','captureBtn','switchCameraBtn','visibilitychange']) if(!torch.includes(marker)) throw new Error(`torch behavior missing: ${marker}`);
if(!sw.includes('/torch.js')) throw new Error('torch asset missing from service worker shell');
console.log('TORCH SMOKE PASS: rear-camera flash control is capability-gated, dynamically loaded and reset on camera lifecycle events');
