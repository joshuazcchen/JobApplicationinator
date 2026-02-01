import html2pdf from 'html2pdf.js';
import JSZip from 'jszip';

interface KeywordData {
    keywords: string[];
    description: string;
}

const DEFAULT_KEYWORDS: Record<string, KeywordData> = {
    "Demo Fragment": {
        keywords: ["example", "demo"],
        description: "<p>This is a demo paragraph! You can edit it the same way you would any other rich text</p><b> like for example, bolded text</b> <h1> or large text</h1><p>. You can also insert tables and stuff but I don't really know why you'd want to.</p>"
    }
};

const DEFAULT_TEMPLATE = `
  <h1>Example Template</h1>
  <p>Dear Steve,</p>
  <div class="insertion-marker" id="active-marker"></div>
  <p>Sincerely,<br>Steve</p>
`;

// currnet state
let activeKeywords = DEFAULT_KEYWORDS;
let currentMarker: HTMLElement | null = null;
const undoStack: string[] = [];

// elements
const viewHome = document.getElementById('view-home')!;
const viewEditor = document.getElementById('view-editor')!;
const jsonEditor = document.getElementById('jsonEditor') as HTMLTextAreaElement;
const paper = document.getElementById('paper')!;
const listContainer = document.getElementById('matches-list')!;
const templateStatus = document.getElementById('templateStatus')!;

chrome.storage.local.get(['customKeywords', 'customTemplate'], (result) => {
    if (result.customKeywords) {
        activeKeywords = result.customKeywords;
        jsonEditor.value = JSON.stringify(activeKeywords, null, 2);
    } else {
        jsonEditor.value = JSON.stringify(DEFAULT_KEYWORDS, null, 2);
    }

    if (result.customTemplate) {
        applyTemplate(result.customTemplate);
    } else {
        paper.innerHTML = DEFAULT_TEMPLATE;
    }
});

document.getElementById('jsonUpload')?.addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            const json = JSON.parse(ev.target?.result as string);
            jsonEditor.value = JSON.stringify(json, null, 4);
            saveKeywords();
        } catch {
            alert("Invalid JSON.");
        }
    };
    reader.readAsText(file);
});

document.getElementById('btn-reset-json')?.addEventListener('click', () => {
    jsonEditor.value = JSON.stringify(DEFAULT_KEYWORDS, null, 4);
});

function applyTemplate(html: string) {
    paper.innerHTML = html;
    templateStatus.innerText = "Loaded";
    templateStatus.style.color = "#3956fc";
    currentMarker = document.getElementById('active-marker');
}

document.getElementById('templateUpload')?.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    if (file.name.endsWith('.zip')) {
        try {
            const zip = await JSZip.loadAsync(file);
            const htmlFileName = Object.keys(zip.files).find(name => name.endsWith('.html'));

            if (!htmlFileName) {
                alert("No HTML file found in this zip!");
                return;
            }

            let htmlContent = await zip.file(htmlFileName)!.async("string");
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlContent, 'text/html');
            const images = doc.querySelectorAll('img');

            const imagePromises = Array.from(images).map(async (img) => {
                const src = img.getAttribute('src');
                if (!src) return;
                const zipPath = decodeURIComponent(src);

                const imgFile = zip.file(zipPath);
                if (imgFile) {
                    const base64 = await imgFile.async("base64");
                    const ext = zipPath.split('.').pop()?.toLowerCase();
                    const mime = ext === 'png' ? 'image/png' : (ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/gif');
                    img.src = `data:${mime};base64,${base64}`;
                }
            });

            await Promise.all(imagePromises);
            let cssString = "";
            doc.querySelectorAll('style').forEach(s => cssString += s.outerHTML);
            const finalHtml = `${cssString}\n${doc.body.innerHTML}`;

            chrome.storage.local.set({ customTemplate: finalHtml });
            applyTemplate(finalHtml);

        } catch (err) {
            console.error(err);
            alert("Failed to read zip file. See console for details.");
        }
    } else {
        const reader = new FileReader();
        reader.onload = (ev) => {
            const fullHtml = ev.target?.result as string;
            const parser = new DOMParser();
            const doc = parser.parseFromString(fullHtml, 'text/html');

            let cssString = "";
            doc.querySelectorAll('style').forEach(s => cssString += s.outerHTML);
            const finalHtml = `${cssString}\n${doc.body.innerHTML}`;

            chrome.storage.local.set({ customTemplate: finalHtml });
            applyTemplate(finalHtml);
        };
        reader.readAsText(file);
    }
});

document.getElementById('btn-reset-template')?.addEventListener('click', () => {
    chrome.storage.local.remove('customTemplate');

    paper.innerHTML = DEFAULT_TEMPLATE;

    templateStatus.innerText = "Using Default";
    templateStatus.style.color = "black";
    (document.getElementById('templateUpload') as HTMLInputElement).value = "";
    currentMarker = document.getElementById('active-marker');
    undoStack.length = 0;
});

function saveKeywords() {
    try {
        const data = JSON.parse(jsonEditor.value);
        activeKeywords = data;
        chrome.storage.local.set({ customKeywords: data });
        return true;
    } catch {
        alert("Invalid JSON.");
        return false;
    }
}

// editor
document.getElementById('btn-goto-editor')?.addEventListener('click', () => {
    if (!saveKeywords()) return;
    viewHome.classList.add('hidden');
    viewEditor.classList.remove('hidden');

    chrome.storage.local.get(['scrapedContent'], (res) => {
        if (res.scrapedContent) renderMatches(findMatches(res.scrapedContent));
    });
});

document.getElementById('btn-back')?.addEventListener('click', () => {
    viewEditor.classList.add('hidden');
    viewHome.classList.remove('hidden');
});

function saveState() {
    undoStack.push(paper.innerHTML);
    if (undoStack.length > 20) undoStack.shift();
}

function performUndo() {
    const prev = undoStack.pop();
    if (prev) {
        paper.innerHTML = prev;
        currentMarker = document.getElementById('active-marker');
    }
}

function findMatches(text: string) {
    const textLower = text.toLowerCase();
    const matches: string[] = [];
    for (const [category, data] of Object.entries(activeKeywords)) {
        const keys = Array.isArray(data) ? data : data.keywords;
        if (keys && keys.some((k: string) => textLower.includes(k.toLowerCase()))) {
            matches.push(category);
        }
    }
    return matches;
}
function renderMatches(categories: string[]) {
    listContainer.innerHTML = '';
    if (categories.length === 0) {
        listContainer.innerHTML = '<div style="padding:10px; color:#656565;">No matches found.</div>';
        return;
    }
    categories.forEach(cat => {
        const btn = document.createElement('div');
        btn.className = 'match-item';
        btn.innerText = `+ ${cat}`;
        btn.onclick = () => insertText(activeKeywords[cat].description);
        listContainer.appendChild(btn);
    });
}

document.getElementById('btn-undo')?.addEventListener('click', performUndo);

document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        performUndo();
    }
});

// marker logic
document.getElementById('btn-marker')?.addEventListener('click', () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    if (!paper.contains(range.commonAncestorContainer)) {
        alert("No selection made. (13)");
        return;
    }

    saveState();

    document.querySelectorAll('.insertion-marker').forEach(el => el.remove());

    if (!range.collapsed) range.deleteContents();

    const marker = document.createElement('div');
    marker.className = 'insertion-marker';
    marker.id = 'active-marker';
    marker.contentEditable = "false";
    const blockParent = getBlockParent(range.startContainer);

    if (blockParent && blockParent !== paper) {
        const splitRange = document.createRange();
        splitRange.setStart(range.startContainer, range.startOffset);
        splitRange.setEndAfter(blockParent.lastChild || blockParent);

        const rightSideFragment = splitRange.extractContents();
        const oldMarkers = rightSideFragment.querySelectorAll?.('.insertion-marker');
        oldMarkers?.forEach((m) => m.remove());
        blockParent.after(marker);

        if (rightSideFragment.textContent?.trim() !== "") {
            const newBlock = blockParent.cloneNode(false) as HTMLElement;
            newBlock.removeAttribute('id');
            newBlock.appendChild(rightSideFragment);
            marker.after(newBlock);
        }
    } else {
        range.insertNode(marker);
    }

    marker.scrollIntoView({ behavior: 'smooth', block: 'center' });
    currentMarker = marker;
    selection.removeAllRanges();
});

document.getElementById('btn-marker-rmv')?.addEventListener('click', () => {
    saveState();
    const markers = document.querySelectorAll('.insertion-marker');

    if (markers.length === 0) {
        console.log("No markers found.");
        return;
    }

    markers.forEach(el => el.remove());
    currentMarker = null;
});
function getBlockParent(node: Node | null): HTMLElement | null {
    while (node && node !== paper) {
        if (node.nodeType === 1) {
            const display = window.getComputedStyle(node as Element).display;
            if (['block', 'flex', 'grid'].includes(display)) return node as HTMLElement;
        }
        node = node.parentNode;
    }
    return null;
}

function insertText(htmlContent: string) {
    saveState();

    const targetFont = fontSelect.value;
    const targetSize = sizeSelect.value;

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    const fragment = document.createDocumentFragment();
    let lastInsertedNode: Node | null = null;

    while (tempDiv.firstChild) {
        const child = tempDiv.firstChild;

        if (child.nodeType === 3 && child.textContent?.trim()) {
            const p = document.createElement('p');
            p.textContent = child.textContent;

            p.style.fontFamily = targetFont;
            p.style.fontSize = targetSize;

            p.style.margin = "0 0 10px 0";

            lastInsertedNode = p;
            fragment.appendChild(p);
            tempDiv.removeChild(child);
        }
        else if (child.nodeType === 1) {
            (child as HTMLElement).style.fontFamily = targetFont;
            (child as HTMLElement).style.fontSize = targetSize;
            lastInsertedNode = child;
            fragment.appendChild(child);
        }
        else {
            lastInsertedNode = child;
            fragment.appendChild(child);
        }
    }

    const marker = document.getElementById('active-marker');

    if (marker) {
        marker.after(fragment);
        if (lastInsertedNode) {
            (lastInsertedNode as Element).after(marker);
            marker.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    } else {
        paper.appendChild(fragment);
    }
}

document.getElementById('btn-export')?.addEventListener('click', () => {
    document.querySelectorAll('.insertion-marker').forEach(el => el.classList.add('print-hide'));

    const opt = {
        margin: 0,
        filename: 'Cover_Letter.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };

    // @ts-ignore
    html2pdf().set(opt).from(paper).save().then(() => {
        document.querySelectorAll('.insertion-marker').forEach(el => el.classList.remove('print-hide'));
    });
});

chrome.storage.onChanged.addListener((changes) => {
    if (changes.scrapedContent) {
        renderMatches(findMatches(changes.scrapedContent.newValue));
    }
});

// cool fancy editor logic
const fontSelect = document.getElementById('fontFamily') as HTMLSelectElement;
const sizeSelect = document.getElementById('fontSize') as HTMLSelectElement;
const btnBold = document.getElementById('btn-bold')!;
const btnItalic = document.getElementById('btn-italic')!;
const btnUnderline = document.getElementById('btn-underline')!;

function applyFormat(command: string, value: string = "") {
    if (command === 'fontSize') {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);

            const fragment = range.extractContents();
            const span = document.createElement('span');
            span.style.fontSize = value;
            span.appendChild(fragment);
            range.insertNode(span);
            selection.removeAllRanges();
            selection.addRange(range);
        }
    } else {
        (document as any).execCommand(command, false, value);
    }
    paper.focus();
    updateToolbarState();
}

const preventFocusLoss = (e: MouseEvent) => {
    e.preventDefault();
};

btnBold.addEventListener('mousedown', (e) => {
    preventFocusLoss(e);
    applyFormat('bold');
});

btnItalic.addEventListener('mousedown', (e) => {
    preventFocusLoss(e);
    applyFormat('italic');
});

btnUnderline.addEventListener('mousedown', (e) => {
    preventFocusLoss(e);
    applyFormat('underline');
});

fontSelect.addEventListener('change', () => {
    applyFormat('fontName', fontSelect.value);
});

sizeSelect.addEventListener('change', () => {
    applyFormat('fontSize', sizeSelect.value);
});

document.addEventListener('selectionchange', () => {
    if (document.activeElement === paper || paper.contains(document.activeElement)) {
        updateToolbarState();
    }
});

function updateToolbarState() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    let node = selection.anchorNode;
    const element = (node && node.nodeType === 3 ? node.parentElement : node) as HTMLElement;

    if (!element || !paper.contains(element)) return;

    const style = window.getComputedStyle(element);

    const isBold = style.fontWeight === 'bold' || parseInt(style.fontWeight) >= 700;
    btnBold.style.background = isBold ? '#ccc' : '';

    const isItalic = style.fontStyle === 'italic';
    btnItalic.style.background = isItalic ? '#ccc' : '';

    const isUnderline = style.textDecorationLine.includes('underline');
    btnUnderline.style.background = isUnderline ? '#ccc' : '';

    const cleanFont = style.fontFamily.replace(/['"]/g, '');
    for (let i = 0; i < fontSelect.options.length; i++) {
        if (cleanFont.toLowerCase().includes(fontSelect.options[i].value.toLowerCase())) {
            fontSelect.selectedIndex = i;
            break;
        }
    }

    const literalSize = element.style.fontSize;

    if (literalSize && literalSize.endsWith('pt')) {
        const exists = Array.from(sizeSelect.options).some(opt => opt.value === literalSize);
        if (exists) {
            sizeSelect.value = literalSize;
            return;
        }
    }

    const sizePx = parseFloat(style.fontSize);
    const sizePt = Math.round(sizePx * 0.75);
    const ptString = `${sizePt}pt`;
    const match = Array.from(sizeSelect.options).find(opt => opt.value === ptString);

    if (match) {
        sizeSelect.value = ptString;
    }
}