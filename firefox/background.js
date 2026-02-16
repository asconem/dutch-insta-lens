// background.js - FINAL STABLE V1.5 (Google Cloud TTS Integration)

const OCR_API_KEY = "K87517314188957";
const DEEPL_API_KEY = "64b77eea-3df9-4747-abb6-b6488ae3e3a4:fx";
const GOOGLE_API_KEY = "AIzaSyBjuYD1C9vJbvuRw_Sxz42YaASxE1IlJU0"; // <--- PASTE KEY HERE

browser.runtime.onMessage.addListener((request, sender) => {
    if (request.action === "scanImage") return processWithAPI(request.url);
    if (request.action === "translate") return handleTranslation(request.text);
    if (request.action === "speakGoogle") return handleGoogleSpeech(request.text);
});

async function handleGoogleSpeech(text) {
    try {
        const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_API_KEY}`;
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                input: { text: text },
                voice: { languageCode: "nl-NL", name: "nl-NL-Wavenet-A" },
                audioConfig: { audioEncoding: "MP3" }
            })
        });
        if (!response.ok) throw new Error(`Google Error: ${response.status}`);
        const data = await response.json();
        return { audio: data.audioContent };
    } catch (e) { return { error: e.message }; }
}

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

        if (result.ErrorMessage && result.ErrorMessage.includes("E101")) {
            return { success: false, error: "Server Timeout (E101). Try again." };
        }

        if (!result || !result.ParsedResults || result.ParsedResults.length === 0) {
            return { success: false, error: result.ErrorMessage?.[0] || "No text found." };
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

        if (!allWords.length) return { success: true, words: [] };
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
        const w = words[i], sameL = Math.abs(w.top - cur.bbox.y0) < 30, nextL = (w.top - cur.bbox.y1) < 60;
        if (sameL || nextL) {
            cur.words.push(w);
            cur.bbox.x0 = Math.min(cur.bbox.x0, w.left); cur.bbox.y0 = Math.min(cur.bbox.y0, w.top);
            cur.bbox.x1 = Math.max(cur.bbox.x1, w.right); cur.bbox.y1 = Math.max(cur.bbox.y1, w.bottom);
        } else { blocks.push(cur); cur = { words: [w], bbox: { x0: w.left, y0: w.top, x1: w.right, y1: w.bottom } }; }
    }
    blocks.push(cur);
    return blocks.map(b => ({ text: b.words.map(w => w.text).join(" ").trim(), bbox: b.bbox }));
}

async function handleTranslation(text) {
    try {
        const body = new URLSearchParams();
        body.append('text', text);
        body.append('target_lang', 'EN');
        body.append('source_lang', 'NL');

        const response = await fetch("https://api-free.deepl.com/v2/translate", {
            method: "POST",
            headers: {
                "Authorization": `DeepL-Auth-Key ${DEEPL_API_KEY}`,
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: body
        });

        const data = await response.json();
        if (data.translations && data.translations.length > 0) {
            return { success: true, translation: data.translations[0].text };
        }
    } catch (e) {
        const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=nl&tl=en&dt=t&q=${encodeURIComponent(text)}`);
        const data = await res.json();
        return { success: true, translation: data[0].map(item => item[0]).join("") };
    }
}
