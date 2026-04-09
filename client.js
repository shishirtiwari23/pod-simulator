process.env.PATH = process.env.PATH + ':/opt/homebrew/bin';
const WebSocket = require('ws');
const readline = require('readline');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('⏳ Connecting to Gateway...');
const ws = new WebSocket('ws://localhost:8080');

let isRecording = false;
let isProcessing = false;
let recordProcess = null;
const AUDIO_FILE = path.join(__dirname, 'temp_audio.wav');
const OUT_FILE = path.join(__dirname, 'ai_response.wav');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

ws.on('open', () => {
    console.log('✅ Connected to Hardware Node!');
    console.log('\n===================================================');
    console.log('💤 HARDWARE STANDBY MODE');
    console.log('   Press [ENTER] to simulate Wake Word detection');
    console.log('===================================================\n');

    rl.on('line', () => {
        if (isRecording) {
            console.log('⚠️ Hardware is already awake and streaming!');
            return;
        }

        isRecording = true;
        isProcessing = false;
        console.log('\n🔴 [WAKE WORD DETECTED] Hardware Microphone online.');
        console.log('   Streaming live unstructured binaries dynamically...');
        
        // --- PHASE 12: CONTINUOUS HARDWARE STREAMING ---
        // Launch purely raw native hardware PCM streaming directly to stdout! No disk I/O!
        recordProcess = spawn('rec', ['-q', '-V0', '-e', 'signed', '-c', '1', '-b', '16', '-r', '16000', '-t', 'raw', '-']);
        
        // Fire explicit WAKE packet so server boots deepgram mechanically
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ action: "WAKE", format: "linear16" }));
        }

        let bufferRing = Buffer.alloc(0);

        recordProcess.stdout.on('data', (chunk) => {
            if (isProcessing) return; // Drop chunks peacefully while AI speaks
            
            // Unstructured `rec` pipes often slice bytes unevenly natively!
            // 16-bit linear PCM intrinsically algebraically demands perfectly symmetrical pairs.
            bufferRing = Buffer.concat([bufferRing, chunk]);
            
            if (bufferRing.length >= 4096) {
                const symmetricalSize = Math.floor(bufferRing.length / 2) * 2; 
                
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(bufferRing.subarray(0, symmetricalSize)); 
                }
                
                // Keep the remainder cleanly implicitly for the next chunk!
                bufferRing = bufferRing.subarray(symmetricalSize);
            }
        });

        recordProcess.stderr.on('data', (err) => {
            if (err.toString().includes('FAIL')) {
                 console.error(`\n[Hardware Mic Error]: ${err.toString()}`);
            }
        });
    });
});

ws.on('message', (data, isBinary) => {
    if (!isBinary) {
        try {
            const parsed = JSON.parse(data.toString());
            if (parsed.log) console.log(`   ${parsed.log}`);

            // --- THE EXPLICIT HARDWARE SLEEP COMMAND ---
            if (parsed.action === 'SLEEP') {
                if (recordProcess) {
                    recordProcess.kill('SIGINT');
                    recordProcess = null;
                }
                isRecording = false;
                console.log('\n💤 SLEEP COMMAND RECEIVED. Hardware Microphone physically powered down.');
                console.log('   (Press [ENTER] to simulate Wake Word...)');
            }
        } catch(e) {}
        return;
    }

    console.log('\n🔈 AI replying natively...');
    fs.writeFileSync(OUT_FILE, data);
    
    // Natively execute macOS framework audio to completely bypass buffer underflow
    const playProc = spawn('afplay', [OUT_FILE]);
    
    playProc.on('close', () => {
         isProcessing = false; // Unlock the pipeline for the next human input
         if (ws.readyState === WebSocket.OPEN) {
             // Hardware signal that physical speakers are mechanically done
             ws.send(JSON.stringify({ action: "AUDIO_FINISHED" }));
         }
         
         try {
             if (fs.existsSync(OUT_FILE)) fs.unlinkSync(OUT_FILE);
         } catch(cleanupErr) {}
    });
});

ws.on('close', () => {
    console.log('❌ Disconnected from Backend');
    process.exit();
});

ws.on('error', (err) => {
    console.log('⚠️ WebSocket error:', err.message);
});
