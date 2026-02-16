// content.js - FINAL STABLE V1.8 (Script Builder / Notebook Feature)

let lastRawWords = [];
let overlayWatchdog = null;

// 1. Navigation & Cleanup Listeners
window.addEventListener('popstate', cleanupHUD);
let lastUrl = location.href;

new MutationObserver(() => {
    if (location.href !== lastUrl) {
        lastUrl = location.href;
        cleanupHUD();
    }
}).observe(document, { subtree: true, childList: true });

// 2. Click Handler (Trigger Scan)
window.addEventListener('click', (e) => {
    if (!e.shiftKey) return;
    e.preventDefault(); e.stopImmediatePropagation(); e.stopPropagation();

    // Searches for both IMG and VIDEO tags
    const media = findMediaAtClick(e.clientX, e.clientY);
    if (!media) return;

    cleanupHUD();

    const msg = media.tagName === 'VIDEO' ? "\u23F3 Snapshotting Video..." : "\u23F3 Scanning Image...";
    showStatusToast(e.clientX, e.clientY, msg, "black");

    startScanning(media, location.href);
}, true);

// 3. Click Handler (Dismiss Overlays on Outside Click)
window.addEventListener('click', (e) => {
    if (e.shiftKey) return;

    // Ignore clicks inside our UI components (Overlay, Tooltip, AND Script Pad)
    if (e.target.closest('.word-box') ||
        e.target.closest('.dutch-tooltip') ||
        e.target.closest('#insta-lens-script-pad')) return;

    // Otherwise, clear the scanning overlays (but NOT the script pad)
    cleanupHUD();
});

// 4. Cleanup Logic
function cleanupHUD() {
    if (overlayWatchdog) {
        clearInterval(overlayWatchdog);
        overlayWatchdog = null;
    }
    // Note: We deliberately do NOT remove #insta-lens-script-pad here
    document.querySelectorAll('.insta-lens-overlay, .dutch-tooltip').forEach(el => el.remove());
    removeStatusToast();
}

function findMediaAtClick(mouseX, mouseY) {
    const target = document.elementFromPoint(mouseX, mouseY);
    const container = target?.closest('div[role="dialog"]') || target?.closest('article') || document.body;

    const medias = Array.from(container.querySelectorAll('img, video')).filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.width > 150 && rect.height > 150 && el.offsetParent !== null;
    });

    if (medias.length === 0) return null;

    return medias.sort((a, b) => {
        const aRect = a.getBoundingClientRect(), bRect = b.getBoundingClientRect();
        const aC = { x: aRect.left + aRect.width/2, y: aRect.top + aRect.height/2 };
        const bC = { x: bRect.left + bRect.width/2, y: bRect.top + bRect.height/2 };
        const aD = Math.sqrt(Math.pow(mouseX - aC.x, 2) + Math.pow(mouseY - aC.y, 2));
        const bD = Math.sqrt(Math.pow(mouseX - bC.x, 2) + Math.pow(mouseY - bC.y, 2));
        return aD - bD;
    })[0];
}

function captureVideoFrame(video) {
    try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/jpeg", 0.9);
    } catch (e) {
        console.error("Frame capture error:", e);
        return null;
    }
}

function startScanning(media, scanUrl) {
    let payloadUrl = "";

    if (media.tagName === 'VIDEO') {
        try {
            if (!media.crossOrigin) media.crossOrigin = "anonymous";
        } catch (e) { /* Ignore */ }

        payloadUrl = captureVideoFrame(media);

        if (!payloadUrl) {
            removeStatusToast();
            showStatusToast(media.getBoundingClientRect().left, media.getBoundingClientRect().top, "\u274C Video Security Block", "red");
            return;
        }
    } else {
        payloadUrl = media.src;
    }

    browser.runtime.sendMessage({ action: "scanImage", url: payloadUrl }).then(res => {
        removeStatusToast();
        if (location.href !== scanUrl) return;
        if (res?.success) {
            lastRawWords = res.rawWords;
            drawOverlays(media, res.blocks, scanUrl);
        } else {
            showStatusToast(media.getBoundingClientRect().left, media.getBoundingClientRect().top, res.error || "\u274C Failed", "red");
        }
    });
}

function drawOverlays(media, blocks, scanUrl) {
    cleanupHUD();

    const rect = media.getBoundingClientRect();
    const overlay = document.createElement('div');
    overlay.className = "insta-lens-overlay";
    Object.assign(overlay.style, {
        position: 'absolute', top: `${rect.top + window.scrollY}px`, left: `${rect.left + window.scrollX}px`,
        width: `${rect.width}px`, height: `${rect.height}px`, pointerEvents: 'none', zIndex: '2147483647'
    });
    document.body.appendChild(overlay);

    overlayWatchdog = setInterval(() => {
        if (location.href !== scanUrl || !media.isConnected) {
            cleanupHUD();
        }
    }, 500);

    const ocrMaxX = Math.max(...blocks.map(b => b.bbox.x1), 1);
    const ocrMaxY = Math.max(...blocks.map(b => b.bbox.y1), 1);

    const mediaNatW = media.videoWidth || media.naturalWidth || media.width || 1;
    const mediaNatH = media.videoHeight || media.naturalHeight || media.height || 1;

    const canvasW = Math.max(mediaNatW, ocrMaxX);
    const canvasH = Math.max(mediaNatH, ocrMaxY);
    const scaleX = rect.width / canvasW, scaleY = rect.height / canvasH;

    blocks.forEach(b => {
        const box = document.createElement('div');
        box.className = "word-box";
        Object.assign(box.style, {
            position: "absolute", border: "2px solid red", background: "rgba(255, 0, 0, 0.1)",
            cursor: "pointer", pointerEvents: "auto",
            left: `${b.bbox.x0 * scaleX}px`, top: `${b.bbox.y0 * scaleY}px`,
            width: `${(b.bbox.x1 - b.bbox.x0) * scaleX}px`, height: `${(b.bbox.y1 - b.bbox.y0) * scaleY}px`
        });

        const del = document.createElement('div');
        del.innerHTML = "\u00D7";
        Object.assign(del.style, { position: 'absolute', top: '-10px', right: '-10px', width: '20px', height: '20px', background: 'red', color: 'white', borderRadius: '50%', textAlign: 'center', lineHeight: '18px', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer', zIndex: '20' });
        del.onclick = (ev) => { ev.stopPropagation(); box.remove(); };
        box.appendChild(del);

        [ {id:'br', pos:{bottom:'0', right:'0'}, cur:'nwse-resize'}, {id:'tl', pos:{top:'0', left:'0'}, cur:'nwse-resize'} ].forEach(h => {
            const el = document.createElement('div');
            Object.assign(el.style, { position: 'absolute', width: '12px', height: '12px', background: 'red', cursor: h.cur, ...h.pos });
            el.onmousedown = (e) => {
                e.preventDefault(); e.stopPropagation();
                const sX = e.clientX, sY = e.clientY, sW = box.offsetWidth, sH = box.offsetHeight, sL = box.offsetLeft, sT = box.offsetTop;
                const onMove = (m) => {
                    const dx = m.clientX - sX, dy = m.clientY - sY;
                    if (h.id === 'br') { box.style.width = `${sW + dx}px`; box.style.height = `${sH + dy}px`; }
                    else { box.style.width = `${sW - dx}px`; box.style.height = `${sH - dy}px`; box.style.left = `${sL + dx}px`; box.style.top = `${sT + dy}px`; }
                };
                const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
                document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
            };
            box.appendChild(el);
        });

        box.addEventListener('click', (e) => {
            if (e.target.parentNode === box && e.target.style.background === 'red') return;
            e.stopPropagation();
            showTooltip(e.clientY, recalculateText(box, scaleX, scaleY));
        });
        overlay.appendChild(box);
    });
}

function recalculateText(box, scaleX, scaleY) {
    const boxL = parseFloat(box.style.left) / scaleX;
    const boxT = parseFloat(box.style.top) / scaleY;
    const boxR = (parseFloat(box.style.left) + box.offsetWidth) / scaleX;
    const boxB = (parseFloat(box.style.top) + box.offsetHeight) / scaleY;
    return lastRawWords.filter(w => {
        const midX = w.left + (w.width / 2), midY = w.top + (w.height / 2);
        return midX >= boxL && midX <= boxR && midY >= boxT && midY <= boxB;
    }).map(w => w.text).join(" ").trim();
}

function speakText(text) {
    if (!text) return;
    browser.runtime.sendMessage({ action: "speakGoogle", text: text }).then(res => {
        if (res?.audio) {
            const audio = new Audio("data:audio/mp3;base64," + res.audio);
            audio.play();
        } else {
            console.error("Speech Error:", res.error);
        }
    });
}

// --- NEW SCRIPT PAD LOGIC ---

function addToScriptPad(text) {
    let pad = document.getElementById('insta-lens-script-pad');

    // Create Pad if it doesn't exist
    if (!pad) {
        pad = document.createElement('div');
        pad.id = 'insta-lens-script-pad';
        Object.assign(pad.style, {
            position: 'fixed', bottom: '20px', right: '20px', width: '300px',
            background: 'white', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            zIndex: '2147483647', padding: '12px', fontFamily: 'sans-serif',
            display: 'flex', flexDirection: 'column', gap: '8px'
        });

        pad.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #eee; padding-bottom:5px;">
                <strong style="font-size:14px;">\uD83C\uDDF3\uD83C\uDDF1 Script Pad</strong>
                <button id="close-pad-btn" style="background:none; border:none; cursor:pointer; font-size:16px;">\u00D7</button>
            </div>
            <textarea id="script-pad-input" style="width:100%; height:80px; padding:5px; border:1px solid #ccc; borderRadius:4px; resize:vertical; font-size:13px;" placeholder="Collected text..."></textarea>
            <div style="display:flex; gap:5px;">
                <button id="pad-translate-btn" style="flex:1; background:#007bff; color:white; border:none; padding:6px; borderRadius:4px; cursor:pointer; font-weight:bold;">Translate All</button>
                <button id="pad-clear-btn" style="background:#dc3545; color:white; border:none; padding:6px; borderRadius:4px; cursor:pointer;">Clear</button>
            </div>
            <div id="pad-translation-output" style="background:#f8f9fa; border:1px solid #eee; padding:8px; borderRadius:4px; font-size:13px; min-height:40px; margin-top:5px; color:#555; display:none;"></div>
        `;
        document.body.appendChild(pad);

        // Pad Event Listeners
        pad.querySelector('#close-pad-btn').onclick = () => pad.remove();
        pad.querySelector('#pad-clear-btn').onclick = () => {
            pad.querySelector('#script-pad-input').value = "";
            pad.querySelector('#pad-translation-output').style.display = 'none';
        };
        pad.querySelector('#pad-translate-btn').onclick = () => {
            const currentText = pad.querySelector('#script-pad-input').value.trim();
            if(!currentText) return;
            const outDiv = pad.querySelector('#pad-translation-output');
            outDiv.style.display = 'block';
            outDiv.innerHTML = "<em>Translating full script...</em>";

            browser.runtime.sendMessage({ action: "translate", text: currentText }).then(res => {
                outDiv.innerHTML = `<strong>\uD83C\uDDFA\uD83C\uDDF8 English:</strong><br>${res.translation}`;
            });
        };
    }

    // Append new text
    const textarea = pad.querySelector('#script-pad-input');
    textarea.value += (textarea.value ? "\n" : "") + text;
    textarea.scrollTop = textarea.scrollHeight; // Auto-scroll to bottom
}

// --- UPDATED TOOLTIP ---

function showTooltip(clickY, text) {
    const overlay = document.querySelector('.insta-lens-overlay');
    if (!overlay) return;
    const overlayRect = overlay.getBoundingClientRect();

    document.querySelectorAll('.dutch-tooltip').forEach(t => t.remove());

    const tt = document.createElement('div');
    tt.className = 'dutch-tooltip';
    let leftPos = overlayRect.right + 20;
    if (leftPos + 320 > window.innerWidth) leftPos = overlayRect.left - 340;

    Object.assign(tt.style, {
        position: 'fixed', zIndex: '2147483647', background: 'white', color: 'black',
        padding: '15px', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
        width: '320px', left: `${leftPos}px`, top: `${Math.max(10, clickY - 150)}px`
    });

    tt.innerHTML = `
        <div style="margin-bottom:8px; border-bottom:1px solid #eee; padding-bottom:5px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <strong>\uD83C\uDDF3\uD83C\uDDF1 Dutch (Edit to Fix):</strong>
                <div style="display:flex; gap:5px;">
                    <button id="add-to-script-btn" title="Add to Script Pad" style="background:#28a745; color:white; border:none; cursor:pointer; font-size:14px; width:24px; height:24px; borderRadius:4px; display:flex; align-items:center; justify-content:center;">+</button>
                    <button id="pronounce-btn" title="Speak" style="background:none; border:none; cursor:pointer; font-size:18px;">\uD83D\uDD0A</button>
                </div>
            </div>
            <div id="editable-dutch" contenteditable="true" style="padding:5px; background:#f9f9f9; border:1px dashed #ccc; margin-top:5px; outline:none;">${text}</div>
        </div>
        <div id="translation-result">\uD83C\uDDFA\uD83C\uDDF8 <em>Translating...</em></div>
        <button id="re-translate-btn" style="margin-top:10px; width:100%; padding:8px; background:#007bff; color:white; border:none; border-radius:5px; cursor:pointer; font-weight:bold;">Re-Translate</button>
    `;

    document.body.appendChild(tt);

    const runTranslation = (newText) => {
        const resEl = tt.querySelector('#translation-result');
        resEl.innerHTML = "\uD83C\uDDFA\uD83C\uDDF8 <em>Translating...</em>";
        browser.runtime.sendMessage({ action: "translate", text: newText }).then(res => { if (document.body.contains(tt)) resEl.innerHTML = `\uD83C\uDDFA\uD83C\uDDF8 <strong>${res.translation}</strong>`; });
    };
    runTranslation(text);

    // Event Bindings
    tt.querySelector('#re-translate-btn').onclick = () => runTranslation(tt.querySelector('#editable-dutch').textContent.trim());
    tt.querySelector('#pronounce-btn').onclick = () => speakText(tt.querySelector('#editable-dutch').textContent.trim());

    // NEW: Add to Script Handler
    tt.querySelector('#add-to-script-btn').onclick = () => {
        const currentText = tt.querySelector('#editable-dutch').textContent.trim();
        addToScriptPad(currentText);
        // Visual feedback
        const btn = tt.querySelector('#add-to-script-btn');
        btn.textContent = "\u2713";
        setTimeout(() => btn.textContent = "+", 1000);
    };

    tt.addEventListener('click', (ev) => ev.stopPropagation());
}

function showStatusToast(x, y, msg, color) {
    removeStatusToast();
    const t = document.createElement('div');
    t.id = "scan-status-toast"; t.textContent = msg;
    Object.assign(t.style, { position: "fixed", top: `${y}px`, left: `${x}px`, background: color, color: "white", padding: "8px 12px", borderRadius: "20px", zIndex: "2147483647" });
    document.body.appendChild(t);
}

function removeStatusToast() { document.getElementById("scan-status-toast")?.remove(); }
