// content.js - Full V1.3.0

if (typeof browser === "undefined") {
    var browser = chrome;
}

let lastRawWords = [];
let overlayWatchdog = null;

window.addEventListener('popstate', cleanupHUD);
let lastUrl = location.href;
new MutationObserver(() => {
    if (location.href !== lastUrl) {
        lastUrl = location.href;
        cleanupHUD();
    }
}).observe(document, { subtree: true, childList: true });

window.addEventListener('click', (e) => {
    if (!e.shiftKey) return;
    e.preventDefault(); e.stopPropagation();
    const img = findImageAtClick(e.clientX, e.clientY);
    if (!img) return;
    cleanupHUD();
    showStatusToast(e.clientX, e.clientY, "\u23F3 Scanning...", "black");
    browser.runtime.sendMessage({ action: "scanImage", url: img.src }).then(res => {
        removeStatusToast();
        if (res?.success) {
            lastRawWords = res.rawWords;
            drawOverlays(img, res.blocks, location.href);
        }
    });
}, true);

function cleanupHUD() {
    if (overlayWatchdog) clearInterval(overlayWatchdog);
    document.querySelectorAll('.insta-lens-overlay, .dutch-tooltip').forEach(el => el.remove());
    removeStatusToast();
}

function findImageAtClick(mouseX, mouseY) {
    const target = document.elementFromPoint(mouseX, mouseY);
    const container = target?.closest('div[role="dialog"]') || target?.closest('article') || document.body;
    const imgs = Array.from(container.querySelectorAll('img')).filter(img => img.getBoundingClientRect().width > 150);
    return imgs.sort((a, b) => {
        const aR = a.getBoundingClientRect(), bR = b.getBoundingClientRect();
        return Math.hypot(mouseX - (aR.left + aR.width / 2), mouseY - (aR.top + aR.height / 2)) -
               Math.hypot(mouseX - (bR.left + bR.width / 2), mouseY - (bR.top + bR.height / 2));
    })[0];
}

function drawOverlays(img, blocks, scanUrl) {
    const rect = img.getBoundingClientRect();
    const overlay = document.createElement('div');
    overlay.className = "insta-lens-overlay";
    Object.assign(overlay.style, {
        position: 'absolute', top: `${rect.top + window.scrollY}px`, left: `${rect.left + window.scrollX}px`,
        width: `${rect.width}px`, height: `${rect.height}px`, pointerEvents: 'none', zIndex: '2147483647'
    });
    document.body.appendChild(overlay);

    overlayWatchdog = setInterval(() => {
        if (location.href !== scanUrl || !img.isConnected) cleanupHUD();
    }, 500);

    const scaleX = rect.width / Math.max(...blocks.map(b => b.bbox.x1), img.naturalWidth);
    const scaleY = rect.height / Math.max(...blocks.map(b => b.bbox.y1), img.naturalHeight);

    blocks.forEach(b => {
        const box = document.createElement('div');
        box.className = "word-box";
        Object.assign(box.style, {
            left: `${b.bbox.x0 * scaleX}px`, top: `${b.bbox.y0 * scaleY}px`,
            width: `${(b.bbox.x1 - b.bbox.x0) * scaleX}px`, height: `${(b.bbox.y1 - b.bbox.y0) * scaleY}px`
        });

        const del = document.createElement('div');
        del.className = "box-delete-btn";
        del.innerHTML = "\u00D7";
        del.onclick = (ev) => { ev.stopPropagation(); box.remove(); };
        box.appendChild(del);

        [{id:'br', pos:{bottom:'-6px', right:'-6px'}, cur:'nwse-resize'},
         {id:'tl', pos:{top:'-6px', left:'-6px'}, cur:'nwse-resize'}].forEach(h => {
            const handle = document.createElement('div');
            handle.className = "resize-handle";
            Object.assign(handle.style, { cursor: h.cur, ...h.pos });
            handle.onmousedown = (e) => {
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
            box.appendChild(handle);
        });

        box.onclick = (e) => {
            if (e.target.className.includes('btn') || e.target.className.includes('handle')) return;
            e.stopPropagation();
            showTooltip(e.clientY, recalculateText(box, scaleX, scaleY), scanUrl);
        };
        overlay.appendChild(box);
    });
}

function recalculateText(box, sX, sY) {
    const L = parseFloat(box.style.left) / sX, T = parseFloat(box.style.top) / sY;
    const R = (parseFloat(box.style.left) + box.offsetWidth) / sX;
    const B = (parseFloat(box.style.top) + box.offsetHeight) / sY;
    return lastRawWords.filter(w => {
        const mX = w.left + w.width / 2, mY = w.top + w.height / 2;
        return mX >= L && mX <= R && mY >= T && mY <= B;
    }).map(w => w.text).join(" ");
}

function showTooltip(y, text, url) {
    document.querySelectorAll('.dutch-tooltip').forEach(t => t.remove());
    const tt = document.createElement('div');
    tt.className = 'dutch-tooltip';
    Object.assign(tt.style, {
        position: 'fixed', zIndex: '2147483647', background: 'white', padding: '15px',
        borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.3)', width: '300px',
        left: '50px', top: `${y - 50}px`
    });

    tt.addEventListener('click', (ev) => ev.stopPropagation());

    tt.innerHTML = `
        <div style="margin-bottom:8px;">
            <strong>\uD83C\uDDF3\uD83C\uDDF1 Dutch:</strong>
            <div id="editable-dutch" contenteditable="true">${text}</div>
        </div>
        <div id="res">\uD83C\uDDFA\uD83C\uDDF8 <em>Translating...</em></div>
        <button id="re-btn" style="margin-top:10px; width:100%; padding:8px; background:#007bff; color:white; border:none; border-radius:5px; cursor:pointer;">Re-Translate</button>
    `;
    document.body.appendChild(tt);

    const go = (txt) => {
        tt.querySelector('#res').innerHTML = "\uD83C\uDDFA\uD83C\uDDF8 <em>Translating...</em>";
        browser.runtime.sendMessage({ action: "translate", text: txt }).then(r => tt.querySelector('#res').innerHTML = `\uD83C\uDDFA\uD83C\uDDF8 <strong>${r.translation}</strong>`);
    };
    go(text);

    tt.querySelector('#re-btn').onclick = (ev) => {
        ev.stopPropagation();
        go(tt.querySelector('#editable-dutch').textContent);
    };

    const closeOnBackground = () => {
        tt.remove();
        window.removeEventListener('click', closeOnBackground);
    };
    setTimeout(() => window.addEventListener('click', closeOnBackground), 100);
}

function showStatusToast(x, y, msg, color) {
    removeStatusToast();
    const t = document.createElement('div');
    t.id = "scan-status-toast";
    t.textContent = msg;
    Object.assign(t.style, { position: "fixed", top: `${y}px`, left: `${x}px`, background: color, color: "white", padding: "8px 12px", borderRadius: "20px", zIndex: "2147483647" });
    document.body.appendChild(t);
}

function removeStatusToast() {
    document.getElementById("scan-status-toast")?.remove();
}
