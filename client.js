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
let playProcess = null;

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

            if (parsed.action === 'STOP_AUDIO') {
                if (playProcess) {
                    playProcess.kill('SIGKILL');
                    playProcess = null;
                }
                isProcessing = false;
                console.log('\n🛑 STOP_AUDIO RECEIVED. Silencing Output.');
                return;
            }

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

            if (parsed.action === 'TTS_STREAM_CLOSED') {
                if (playProcess && playProcess.stdin) {
                     playProcess.stdin.end(); // Safely closes the hardware pipeline so `on('close')` fires correctly!
                }
            }
        } catch(e) {}
        return;
    }

    if (!playProcess) {
        console.log('\n🔈 AI replying natively via high-speed PCM pipeline...');
        isProcessing = true;
        // Launch a persistent `play` process expecting raw 16-bit 24kHz mono PCM on stdin
        playProcess = spawn('play', ['-q', '-t', 'raw', '-r', '24000', '-e', 'signed', '-b', '16', '-c', '1', '-']);
        
        playProcess.on('close', () => {
             isProcessing = false; // Unlock pipeline
             playProcess = null;
             if (ws.readyState === WebSocket.OPEN) {
                 ws.send(JSON.stringify({ action: "AUDIO_FINISHED" }));
             }
        });

        playProcess.stderr.on('data', (err) => {
            if (!err.toString().includes('play')) {
                console.error(`[Play Error]: ${err.toString()}`);
            }
        });
    }

    // Pipe the raw PCM data immediately to existing active hardware stream
    if (playProcess && playProcess.stdin.writable) {
        playProcess.stdin.write(data);
    }
});

ws.on('close', () => {
    console.log('❌ Disconnected from Backend');
    process.exit();
});

ws.on('error', (err) => {
    console.log('⚠️ WebSocket error:', err.message);
});
