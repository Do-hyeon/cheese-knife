const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
process.once('message', ({ nonce, root, mode }) => {
  process.send({ type: 'launch-intent', nonce, caseId: 'valid-ui', phase: 'seed', launchId: 'valid-ui:seed', root });
  process.once('message', () => {
    const descendant = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { detached: true, stdio: 'ignore', windowsHide: true });
    fs.writeFileSync(path.join(root, 'descendant.pid'), String(descendant.pid), { flag: 'wx' });
    descendant.unref();
    if (mode === 'exit') process.exit(0);
    setInterval(() => {}, 1000);
  });
});
