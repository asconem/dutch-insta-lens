// background.js - Full V1.3.0

if (typeof browser === "undefined") {
    var browser = chrome;
}

const OCR_API_KEY = "K87517314188957";
const DEEPL_API_KEY = "64b77eea-3df9-4747-abb6-b6488ae3e3a4:fx";

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "scanImage") {
        processWithAPI(request.url).then(sendResponse);
        return true;
    }
    if (request.action === "translate") {
        handleTranslation(request.text).then(sendResponse);
        return true;
    }
});

async function processWithAPI(url) {
    try {
        const response = await fetch(url, { credentials: 'omit' });
        const blob = await response.blob();
        const base64String = await new Promise((r) => {
            const f = new FileReader();
            f.onloadend = () => r(f.result);
            f.readAsDataURL(blob);
        });

        const formData = new FormData();
        formData.append("base64Image", base64String);
        formData.append("language", "dut");
        formData.append("isOverlayRequired", "true");
        formData.append("apikey", OCR_API_KEY);
        formData.append("OCREngine", "2");

        const res = await fetch("https://api.ocr.space/parse/image", { method: "POST", body: formData });
        const result = await res.json();

        if (!result || !result.ParsedResults || result.ParsedResults.length === 0) {
            return { success: false, error: "No text found." };
        }

        let allWords = [];
        const lines = result.ParsedResults[0].TextOverlay?.Lines || [];
        lines.forEach(line => {
            line.Words.forEach(w => {
                allWords.push({
                    text: w.WordText, top: w.Top, left: w.Left,
                    width: w.Width, height: w.Height,
                    bottom: w.Top + w.Height, right: w.Left + w.Width
                });
            });
        });

        allWords.sort((a, b) => Math.abs(a.top - b.top) < 20 ? a.left - b.left : a.top - b.top);
        return { success: true, rawWords: allWords, blocks: groupIntoBlocks(allWords) };
    } catch (e) {
        return { success: false, error: "API Error: " + e.message };
    }
}

function groupIntoBlocks(words) {
    if (!words.length) return [];
    const blocks = [];
    let cur = { words: [words[0]], bbox: { x0: words[0].left, y0: words[0].top, x1: words[0].right, y1: words[0].bottom } };

    for (let i = 1; i < words.length; i++) {
        const w = words[i];
        if (Math.abs(w.top - cur.bbox.y0) < 30 || (w.top - cur.bbox.y1) < 60) {
            cur.words.push(w);
            cur.bbox.x0 = Math.min(cur.bbox.x0, w.left);
            cur.bbox.y0 = Math.min(cur.bbox.y0, w.top);
            cur.bbox.x1 = Math.max(cur.bbox.x1, w.right);
            cur.bbox.y1 = Math.max(cur.bbox.y1, w.bottom);
        } else {
            blocks.push(cur);
            cur = { words: [w], bbox: { x0: w.left, y0: w.top, x1: w.right, y1: w.bottom } };
        }
    }
    blocks.push(cur);
    return blocks.map(b => ({ text: b.words.map(w => w.text).join(" ").trim(), bbox: b.bbox }));
}

async function handleTranslation(text) {
    try {
        const body = new URLSearchParams({ auth_key: DEEPL_API_KEY, text: text, target_lang: 'EN', source_lang: 'NL' });
        const response = await fetch("https://api-free.deepl.com/v2/translate", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: body.toString()
        });
        const data = await response.json();
        return { success: true, translation: data.translations[0].text };
    } catch (e) {
        const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=nl&tl=en&dt=t&q=${encodeURIComponent(text)}`);
        const data = await res.json();
        return { success: true, translation: data[0].map(item => item[0]).join("") };
    }
}
