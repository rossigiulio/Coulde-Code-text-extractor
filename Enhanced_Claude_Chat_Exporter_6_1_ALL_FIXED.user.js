// ==UserScript==
// @name         Enhanced Claude Chat & Code Exporter 6.1 (FIXED ALL ISSUES)
// @namespace    http://tampermonkey.net/
// @version      6.1
// @description  Complete Claude chat exporter - FIXED incomplete documents, missing text, analyzed data
// @author       Giulio Rossi (v6.1 - All Issues Fixed)
// @match        https://claude.ai/chat/*
// @grant        GM_registerMenuCommand
// @grant        GM_download
// @license      Proprietary - All Rights Reserved
// ==/UserScript==

(function() {
    'use strict';

    let exportedFiles = [];
    let artifactElementsProcessed = new Set(); // Track processed artifacts

    function downloadFile(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
    }

    function generateTimestamp() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        return `${year}${month}${day}_${hours}${minutes}${seconds}`;
    }

    // Enhanced HTML to Markdown converter
    function htmlToMarkdown(element, depth = 0, listContext = null) {
        if (!element) return '';
        
        let markdown = '';
        const indent = '  '.repeat(depth);
        
        if (element.nodeType === Node.TEXT_NODE) {
            return element.textContent;
        }
        
        if (element.nodeType !== Node.ELEMENT_NODE) {
            return '';
        }
        
        const tagName = element.tagName.toLowerCase();
        
        // Check for inline styles
        const style = element.getAttribute('style') || '';
        let prefix = '';
        let suffix = '';
        
        if (style.includes('color:') || style.includes('background')) {
            const colorMatch = style.match(/color:\s*([^;]+)/);
            const bgMatch = style.match(/background(?:-color)?:\s*([^;]+)/);
            
            if (colorMatch || bgMatch) {
                prefix = '<span style="' + style + '">';
                suffix = '</span>';
            }
        }
        
        switch (tagName) {
            case 'p':
                const pContent = processChildren(element, depth, listContext);
                if (pContent.trim()) {
                    markdown += pContent + '\n\n';
                }
                break;
                
            case 'div':
                const divContent = processChildren(element, depth, listContext);
                if (divContent.trim()) {
                    const className = element.className || '';
                    
                    if (className.includes('callout') || className.includes('alert') || className.includes('note')) {
                        markdown += '\n> [!NOTE]\n';
                        divContent.split('\n').forEach(line => {
                            if (line.trim()) markdown += '> ' + line + '\n';
                        });
                        markdown += '\n';
                    } else {
                        markdown += divContent;
                    }
                }
                break;
                
            case 'span':
                markdown += prefix + processChildren(element, depth, listContext) + suffix;
                break;
                
            case 'br':
                markdown += '\n';
                break;
                
            case 'strong':
            case 'b':
                markdown += '**' + processChildren(element, depth, listContext) + '**';
                break;
                
            case 'em':
            case 'i':
                markdown += '*' + processChildren(element, depth, listContext) + '*';
                break;
                
            case 'u':
                markdown += '<u>' + processChildren(element, depth, listContext) + '</u>';
                break;
                
            case 's':
            case 'strike':
            case 'del':
                markdown += '~~' + processChildren(element, depth, listContext) + '~~';
                break;
                
            case 'mark':
                markdown += '==' + processChildren(element, depth, listContext) + '==';
                break;
                
            case 'sup':
                markdown += '<sup>' + processChildren(element, depth, listContext) + '</sup>';
                break;
                
            case 'sub':
                markdown += '<sub>' + processChildren(element, depth, listContext) + '</sub>';
                break;
                
            case 'code':
                if (element.parentElement && element.parentElement.tagName.toLowerCase() === 'pre') {
                    return processChildren(element, depth, listContext);
                } else {
                    markdown += '`' + element.textContent + '`';
                }
                break;
                
            case 'pre':
                const codeElement = element.querySelector('code');
                if (codeElement) {
                    let language = '';
                    if (codeElement.className) {
                        const match = codeElement.className.match(/language-(\w+)/);
                        if (match) language = match[1];
                    }
                    markdown += '```' + language + '\n' + codeElement.textContent + '\n```\n\n';
                } else {
                    markdown += '```\n' + element.textContent + '\n```\n\n';
                }
                break;
                
            case 'h1':
                markdown += '# ' + processChildren(element, depth, listContext) + '\n\n';
                break;
            case 'h2':
                markdown += '## ' + processChildren(element, depth, listContext) + '\n\n';
                break;
            case 'h3':
                markdown += '### ' + processChildren(element, depth, listContext) + '\n\n';
                break;
            case 'h4':
                markdown += '#### ' + processChildren(element, depth, listContext) + '\n\n';
                break;
            case 'h5':
                markdown += '##### ' + processChildren(element, depth, listContext) + '\n\n';
                break;
            case 'h6':
                markdown += '###### ' + processChildren(element, depth, listContext) + '\n\n';
                break;
                
            case 'a':
                const href = element.getAttribute('href') || '';
                const linkText = processChildren(element, depth, listContext);
                markdown += '[' + linkText + '](' + href + ')';
                break;
                
            case 'ul':
                const newDepth = listContext === 'ol' || listContext === 'ul' ? depth + 1 : depth;
                Array.from(element.children).forEach(child => {
                    if (child.tagName.toLowerCase() === 'li') {
                        const liContent = processListItem(child, newDepth, 'ul');
                        markdown += liContent;
                    }
                });
                if (!listContext) markdown += '\n';
                break;
                
            case 'ol':
                const newOlDepth = listContext === 'ol' || listContext === 'ul' ? depth + 1 : depth;
                Array.from(element.children).forEach((child, index) => {
                    if (child.tagName.toLowerCase() === 'li') {
                        const liContent = processListItem(child, newOlDepth, 'ol', index + 1);
                        markdown += liContent;
                    }
                });
                if (!listContext) markdown += '\n';
                break;
                
            case 'li':
                markdown += processChildren(element, depth, listContext);
                break;
                
            case 'blockquote':
                const quoteLines = processChildren(element, depth, listContext).split('\n');
                quoteLines.forEach(line => {
                    if (line.trim()) {
                        markdown += '> ' + line.trim() + '\n';
                    }
                });
                markdown += '\n';
                break;
                
            case 'table':
                markdown += processTable(element) + '\n\n';
                break;
                
            case 'hr':
                markdown += '---\n\n';
                break;
                
            case 'img':
                const alt = element.getAttribute('alt') || '';
                const src = element.getAttribute('src') || '';
                markdown += '![' + alt + '](' + src + ')';
                break;
                
            case 'details':
                const summary = element.querySelector('summary');
                const summaryText = summary ? summary.textContent.trim() : 'Details';
                markdown += '<details>\n<summary>' + summaryText + '</summary>\n\n';
                
                Array.from(element.childNodes).forEach(child => {
                    if (child !== summary) {
                        markdown += htmlToMarkdown(child, depth, listContext);
                    }
                });
                
                markdown += '\n</details>\n\n';
                break;
                
            case 'summary':
                break;
                
            case 'kbd':
                markdown += '<kbd>' + element.textContent + '</kbd>';
                break;
                
            case 'abbr':
                const title = element.getAttribute('title');
                if (title) {
                    markdown += element.textContent + ' (' + title + ')';
                } else {
                    markdown += element.textContent;
                }
                break;
                
            case 'dl':
                Array.from(element.children).forEach(child => {
                    const tag = child.tagName.toLowerCase();
                    if (tag === 'dt') {
                        markdown += '**' + child.textContent + '**\n';
                    } else if (tag === 'dd') {
                        markdown += ': ' + processChildren(child, depth, listContext) + '\n';
                    }
                });
                markdown += '\n';
                break;
                
            default:
                markdown += processChildren(element, depth, listContext);
        }
        
        return markdown;
    }
    
    function processListItem(liElement, depth, listType, index = null) {
        const indent = '  '.repeat(depth);
        let markdown = '';
        
        const bullet = listType === 'ul' ? '- ' : (index + '. ');
        
        let itemContent = '';
        let hasNestedList = false;
        
        Array.from(liElement.childNodes).forEach(child => {
            const childTag = child.tagName ? child.tagName.toLowerCase() : '';
            
            if (childTag === 'ul' || childTag === 'ol') {
                hasNestedList = true;
                if (itemContent.trim()) {
                    markdown += indent + bullet + itemContent.trim() + '\n';
                    itemContent = '';
                }
                markdown += htmlToMarkdown(child, depth + 1, listType);
            } else {
                itemContent += htmlToMarkdown(child, depth, listType);
            }
        });
        
        if (itemContent.trim()) {
            markdown += indent + bullet + itemContent.trim() + '\n';
        }
        
        return markdown;
    }
    
    function processChildren(element, depth = 0, listContext = null) {
        let result = '';
        Array.from(element.childNodes).forEach(child => {
            result += htmlToMarkdown(child, depth, listContext);
        });
        return result;
    }
    
    function processTable(table) {
        let markdown = '';
        const rows = table.querySelectorAll('tr');
        
        if (rows.length === 0) return '';
        
        let hasHeader = false;
        const firstRow = rows[0];
        if (firstRow.querySelector('th')) {
            hasHeader = true;
        }
        
        rows.forEach((row, rowIndex) => {
            const cells = row.querySelectorAll('th, td');
            const cellContents = [];
            
            cells.forEach(cell => {
                let cellText = processChildren(cell).trim().replace(/\n/g, ' ');
                cellContents.push(cellText);
            });
            
            markdown += '| ' + cellContents.join(' | ') + ' |\n';
            
            if (rowIndex === 0 && hasHeader) {
                markdown += '| ' + cellContents.map(() => '---').join(' | ') + ' |\n';
            }
        });
        
        return markdown;
    }

    // FIXED: Better analyzed data detection
    function isAnalyzedDataBlock(element) {
        const text = element.textContent || '';
        const testId = element.getAttribute('data-testid') || '';
        
        // Check for analyzed data indicators
        return testId === 'repl-output' || 
               text.includes('Analyzed data') || 
               text.includes('dataView analysis') ||
               text.includes('Analysis results') ||
               (text.includes('Raw:') && text.includes('Final:') && text.includes('supplier'));
    }

    function extractAnalyzedDataBlock(element) {
        let result = '\n### 📊 Analyzed Data\n\n';
        
        // Get all text content with formatting
        const content = htmlToMarkdown(element);
        result += content + '\n\n';
        
        return result;
    }

    // FIXED: Auto-download PDFs without popup
    async function exportPDFs(timestampPrefix, fileCounter) {
        const pdfFiles = [];
        
        const pdfElements = document.querySelectorAll('[data-testid*=".pdf"]');
        logDebug(`Found ${pdfElements.length} PDF elements`);

        for (const pdfEl of pdfElements) {
            try {
                const testId = pdfEl.getAttribute('data-testid');
                const originalFileName = testId || 'document.pdf';
                
                logDebug(`Processing PDF: ${originalFileName}`);

                const iframe = pdfEl.querySelector('iframe');
                if (!iframe) {
                    logDebug('No iframe found for PDF');
                    continue;
                }

                const pdfUrl = iframe.src;
                if (!pdfUrl) {
                    logDebug('No source URL found');
                    continue;
                }

                logDebug(`Fetching PDF from: ${pdfUrl}`);
                
                const response = await fetch(pdfUrl);
                
                if (!response.ok) {
                    logDebug(`Failed to fetch PDF: ${response.status}`);
                    continue;
                }

                const blob = await response.blob();
                const artifactNumber = String(fileCounter.value).padStart(2, '0');
                const sanitizedName = sanitizeFileName(originalFileName.replace('.pdf', ''));
                const exportFileName = `${timestampPrefix}_${artifactNumber}_${sanitizedName}.pdf`;
                
                fileCounter.value++;

                downloadFile(blob, exportFileName);
                
                pdfFiles.push({
                    originalName: originalFileName,
                    exportedName: exportFileName,
                    type: 'pdf'
                });

                logDebug(`✓ Auto-downloaded PDF: ${exportFileName}`);
                
                await new Promise(resolve => setTimeout(resolve, 500));
                
            } catch (error) {
                logDebug(`Error exporting PDF: ${error.message}`);
            }
        }
        
        return pdfFiles;
    }

    // FIXED: Complete document extraction - get ALL content from artifact panel
    async function exportDocumentArtifacts(timestampPrefix, fileCounter) {
        const documents = [];
        
        // Strategy: Look for the right-side artifact panel (not the button in main chat)
        // The actual document content is in a separate panel/iframe/container
        
        // Find all potential artifact panels
        const allDivs = document.querySelectorAll('div');
        const documentPanels = [];
        
        for (const div of allDivs) {
            const text = div.textContent;
            
            // Look for panels that have "Document" indicator AND substantial content
            if (text.includes('Document') && text.includes('Version') && text.length > 1000) {
                // Make sure it's not a nested element we already have
                const isDuplicate = documentPanels.some(existing => 
                    existing.contains(div) || div.contains(existing)
                );
                
                if (!isDuplicate) {
                    documentPanels.push(div);
                    artifactElementsProcessed.add(div); // Mark as processed
                }
            }
        }
        
        logDebug(`Found ${documentPanels.length} document artifact panels`);
        
        for (const panel of documentPanels) {
            try {
                // Extract title - look for the main heading
                let title = 'Untitled_Document';
                
                // Try multiple strategies to find the title
                const h1Elements = panel.querySelectorAll('h1');
                const h2Elements = panel.querySelectorAll('h2');
                
                // Look for the document title (not the metadata "# Untitled Document")
                for (const h of [...h1Elements, ...h2Elements]) {
                    const titleText = h.textContent.trim();
                    // Skip the filename-style title, get the actual document title
                    if (titleText && 
                        !titleText.includes('20251103') && 
                        !titleText.includes('Untitled_Document') &&
                        titleText.length < 150) {
                        title = titleText;
                        break;
                    }
                }
                
                logDebug(`Extracting document: ${title}`);
                
                // Extract ALL content - don't try to find specific content areas
                // Just convert the entire panel to markdown
                let content = htmlToMarkdown(panel);
                
                // Clean up metadata and UI elements
                content = content.replace(/Type:\s*Document Artifact/g, '');
                content = content.replace(/Exported:\s*\d{2}\/\d{2}\/\d{4},\s*\d{2}:\d{2}:\d{2}/g, '');
                content = content.replace(/Document\s*∙\s*Version\s*\d+/g, '');
                content = content.replace(/20251103_\d+_[^\n]+/g, ''); // Remove filename headers
                content = content.replace(/\n{3,}/g, '\n\n').trim();
                
                if (content.length < 200) {
                    logDebug('Skipping artifact with too little content');
                    continue;
                }
                
                // Create markdown file with full content
                let markdown = `# ${title}\n\n`;
                markdown += `**Type:** Document Artifact\n`;
                markdown += `**Exported:** ${new Date().toLocaleString()}\n\n`;
                markdown += '---\n\n';
                markdown += content;
                
                const artifactNumber = String(fileCounter.value).padStart(2, '0');
                const safeTitle = sanitizeFileName(title);
                const filename = `${timestampPrefix}_${artifactNumber}_${safeTitle}.md`;
                fileCounter.value++;
                
                const blob = new Blob([markdown], { type: 'text/markdown' });
                downloadFile(blob, filename);
                
                documents.push({
                    originalName: title,
                    exportedName: filename,
                    type: 'document'
                });
                
                logDebug(`✓ Exported document artifact: ${filename} (${content.length} chars)`);
                
                await new Promise(resolve => setTimeout(resolve, 300));
                
            } catch (error) {
                logDebug(`Error exporting document artifact: ${error.message}`);
            }
        }
        
        return documents;
    }

    // FIXED: Better interactive artifact detection
    async function exportInteractiveArtifacts(timestampPrefix, fileCounter) {
        const interactives = [];
        
        // Look for iframes that might contain interactive content
        const iframes = document.querySelectorAll('iframe');
        logDebug(`Found ${iframes.length} total iframes`);
        
        for (const iframe of iframes) {
            try {
                // Skip PDF iframes
                if (iframe.src && iframe.src.includes('.pdf')) {
                    logDebug('Skipping PDF iframe');
                    continue;
                }
                
                // Check if iframe is in an artifact context
                let isInteractiveArtifact = false;
                let containerText = '';
                
                // Walk up the DOM to find artifact indicators
                let parent = iframe.parentElement;
                let depth = 0;
                
                while (parent && depth < 10) {
                    const text = parent.textContent;
                    
                    if (text.includes('Interactive artifact') || 
                        text.includes('Interactive analysis') ||
                        (parent.className && parent.className.includes('artifact'))) {
                        isInteractiveArtifact = true;
                        containerText = text;
                        break;
                    }
                    
                    parent = parent.parentElement;
                    depth++;
                }
                
                if (!isInteractiveArtifact) {
                    logDebug('Iframe not identified as interactive artifact');
                    continue;
                }
                
                logDebug('Found interactive artifact iframe');
                
                // Extract title from surrounding context
                let title = 'Interactive_Artifact';
                
                if (parent) {
                    const titleElements = parent.querySelectorAll('h1, h2, h3');
                    for (const titleEl of titleElements) {
                        const titleText = titleEl.textContent.trim();
                        if (titleText && 
                            !titleText.includes('Interactive artifact') && 
                            titleText.length < 100) {
                            title = titleText;
                            break;
                        }
                    }
                }
                
                // Try to get iframe content
                let htmlContent = '';
                
                try {
                    // Attempt to access iframe content
                    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                    if (iframeDoc) {
                        htmlContent = iframeDoc.documentElement.outerHTML;
                        logDebug('Successfully extracted iframe content');
                    }
                } catch (e) {
                    logDebug('Cannot access iframe content directly (cross-origin)');
                    
                    // Try to fetch from blob URL
                    if (iframe.src && iframe.src.startsWith('blob:')) {
                        try {
                            const response = await fetch(iframe.src);
                            htmlContent = await response.text();
                            logDebug('Successfully fetched iframe content from blob');
                        } catch (fetchError) {
                            logDebug('Failed to fetch iframe content from blob');
                        }
                    }
                }
                
                if (!htmlContent || htmlContent.length < 50) {
                    logDebug('Could not extract interactive content - content too small or empty');
                    continue;
                }
                
                // Ensure complete HTML document
                if (!htmlContent.includes('<!DOCTYPE') && !htmlContent.includes('<html')) {
                    htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
</head>
<body>
${htmlContent}
</body>
</html>`;
                }
                
                const artifactNumber = String(fileCounter.value).padStart(2, '0');
                const safeTitle = sanitizeFileName(title);
                const filename = `${timestampPrefix}_${artifactNumber}_${safeTitle}.html`;
                fileCounter.value++;
                
                const blob = new Blob([htmlContent], { type: 'text/html' });
                downloadFile(blob, filename);
                
                interactives.push({
                    originalName: title,
                    exportedName: filename,
                    type: 'interactive'
                });
                
                logDebug(`✓ Exported interactive artifact: ${filename} (${htmlContent.length} chars)`);
                
                await new Promise(resolve => setTimeout(resolve, 300));
                
            } catch (error) {
                logDebug(`Error exporting interactive artifact: ${error.message}`);
            }
        }
        
        return interactives;
    }

    // FIXED: Main markdown generation - don't skip text after artifacts
    async function generateMarkdown() {
        let markdown = `# ${getChatTitle() || 'Claude Chat'}\n\n`;
        markdown += `**Exported:** ${new Date().toLocaleString()}\n\n`;
        
        // Add file references if any
        if (exportedFiles.length > 0) {
            markdown += '## 📎 Exported Files\n\n';
            
            const pdfFiles = exportedFiles.filter(f => f.type === 'pdf');
            const documents = exportedFiles.filter(f => f.type === 'document');
            const interactives = exportedFiles.filter(f => f.type === 'interactive');
            
            if (pdfFiles.length > 0) {
                markdown += '### PDF Documents\n';
                pdfFiles.forEach(file => {
                    markdown += `- [[${file.exportedName}|${file.originalName}]]\n`;
                });
                markdown += '\n';
            }
            
            if (documents.length > 0) {
                markdown += '### Document Artifacts\n';
                documents.forEach(file => {
                    markdown += `- [[${file.exportedName}|${file.originalName}]]\n`;
                });
                markdown += '\n';
            }
            
            if (interactives.length > 0) {
                markdown += '### Interactive Artifacts\n';
                interactives.forEach(file => {
                    markdown += `- [[${file.exportedName}|${file.originalName}]]\n`;
                });
                markdown += '\n';
            }
        }
        
        markdown += '---\n\n';

        const userMessages = Array.from(document.querySelectorAll('[data-testid="user-message"]'));
        logDebug(`Found ${userMessages.length} user messages`);

        const conversationMap = [];

        // Add user messages
        userMessages.forEach(msg => {
            conversationMap.push({
                type: 'user',
                element: msg,
                position: getElementPosition(msg),
                processed: false
            });
        });

        // Find Claude messages - be more careful to avoid artifact panels
        const allContainers = document.querySelectorAll('div');
        const claudeContainers = [];
        
        for (const container of allContainers) {
            // Skip if it's a user message
            if (container.querySelector('[data-testid="user-message"]')) continue;
            
            // Skip if we already processed this as an artifact
            if (artifactElementsProcessed.has(container)) continue;
            
            // Skip if it's clearly an artifact panel (very long content)
            if (container.textContent.length > 10000 && container.textContent.includes('Document')) {
                continue;
            }
            
            const hasContent = container.querySelector('p, pre, ul, ol, blockquote, h1, h2, h3');
            if (!hasContent) continue;
            
            const text = container.textContent.trim();
            if (text.length < 100) continue;
            
            const isNested = claudeContainers.some(existing => existing.contains(container));
            if (isNested) continue;
            
            const hasNested = claudeContainers.some(existing => container.contains(existing));
            if (hasNested) {
                const nestedIndex = claudeContainers.findIndex(existing => container.contains(existing));
                claudeContainers[nestedIndex] = container;
            } else {
                claudeContainers.push(container);
            }
        }
        
        logDebug(`Found ${claudeContainers.length} Claude message containers`);

        claudeContainers.forEach(msg => {
            conversationMap.push({
                type: 'claude',
                element: msg,
                position: getElementPosition(msg),
                processed: false
            });
        });

        conversationMap.sort((a, b) => a.position - b.position);

        // Process messages
        conversationMap.forEach((item) => {
            if (item.processed) return;
            
            if (item.type === 'user') {
                markdown += `## 👤 User\n\n`;
                markdown += item.element.textContent.trim() + '\n\n';
                markdown += '---\n\n';
                item.processed = true;
                
            } else if (item.type === 'claude') {
                markdown += `## 🤖 Claude\n\n`;
                
                // FIXED: Check for analyzed data FIRST (before other processing)
                const analyzedDataElements = item.element.querySelectorAll('[data-testid="repl-output"], *');
                let foundAnalyzedData = false;
                
                for (const el of analyzedDataElements) {
                    if (isAnalyzedDataBlock(el)) {
                        markdown += extractAnalyzedDataBlock(el);
                        foundAnalyzedData = true;
                        logDebug('Found and extracted analyzed data block');
                        break;
                    }
                }
                
                // Check if this message references an artifact (show link)
                let hasArtifactReference = false;
                const artifactButtons = item.element.querySelectorAll('[class*="artifact"]');
                
                for (const button of artifactButtons) {
                    const buttonText = button.textContent;
                    
                    if (buttonText.includes('Document')) {
                        const docArtifact = exportedFiles.find(f => f.type === 'document');
                        if (docArtifact) {
                            markdown += `\n📄 **Document Artifact:** [[${docArtifact.exportedName}|${docArtifact.originalName}]]\n\n`;
                            hasArtifactReference = true;
                        }
                    } else if (buttonText.includes('Interactive')) {
                        const interactiveArtifact = exportedFiles.find(f => f.type === 'interactive');
                        if (interactiveArtifact) {
                            markdown += `\n🎨 **Interactive Artifact:** [[${interactiveArtifact.exportedName}|${interactiveArtifact.originalName}]]\n\n`;
                            hasArtifactReference = true;
                        }
                    }
                }
                
                // Extract the regular text content
                // IMPORTANT: Don't skip this even if we found artifacts!
                const formattedContent = htmlToMarkdown(item.element);
                let cleanedContent = formattedContent
                    .replace(/Document\s*∙\s*Version\s*\d+/g, '')
                    .replace(/Interactive artifact/gi, '')
                    .replace(/\n{3,}/g, '\n\n')
                    .trim();
                
                // Always include the text content (this was the bug!)
                if (cleanedContent && cleanedContent.length > 20) {
                    markdown += cleanedContent + '\n\n';
                }
                
                markdown += '---\n\n';
                item.processed = true;
            }
        });

        return markdown;
    }

    function getElementPosition(element) {
        const rect = element.getBoundingClientRect();
        return rect.top + window.scrollY;
    }

    function getChatTitle() {
        const titleButton = document.querySelector('[data-testid="chat-title-button"]');
        if (titleButton) return titleButton.textContent.trim();
        
        const headings = document.querySelectorAll('h1, h2');
        for (const h of headings) {
            const text = h.textContent.trim();
            if (text && text.length > 0 && text.length < 200) return text;
        }
        return null;
    }

    function sanitizeFileName(name) {
        return name
            .replace(/[\\/:*?"<>|]/g, '_')
            .replace(/\s+/g, '_')
            .replace(/__+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 100);
    }

    function logDebug(message) {
        console.log(`[Claude Exporter v6.1] ${message}`);
    }

    function showLoadingIndicator(message) {
        hideLoadingIndicator();
        const indicator = document.createElement('div');
        indicator.id = 'claude-export-loading';
        indicator.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);padding:20px;background:rgba(0,0,0,0.8);color:white;border-radius:8px;z-index:10000;font-size:16px;font-family:system-ui';
        indicator.innerHTML = `<div style="display:flex;align-items:center;gap:10px"><div style="border:3px solid rgba(255,255,255,.3);border-radius:50%;border-top:3px solid white;width:20px;height:20px;animation:spin 1s linear infinite"></div><div>${message}</div></div>`;
        
        if (!document.getElementById('claude-export-style')) {
            const style = document.createElement('style');
            style.id = 'claude-export-style';
            style.textContent = '@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}';
            document.head.appendChild(style);
        }
        document.body.appendChild(indicator);
    }

    function hideLoadingIndicator() {
        const indicator = document.getElementById('claude-export-loading');
        if (indicator) document.body.removeChild(indicator);
    }

    function showNotification(message, type = "info") {
        const existing = document.getElementById('claude-export-notification');
        if (existing) document.body.removeChild(existing);

        const notification = document.createElement('div');
        notification.id = 'claude-export-notification';
        notification.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);padding:10px 20px;border-radius:4px;z-index:10000;font-size:14px;font-family:system-ui;text-align:center;max-width:80%;box-shadow:0 2px 10px rgba(0,0,0,0.2)';
        
        if (type === "error") {
            notification.style.backgroundColor = '#f44336';
            notification.style.color = 'white';
        } else if (type === "success") {
            notification.style.backgroundColor = '#4CAF50';
            notification.style.color = 'white';
        } else {
            notification.style.backgroundColor = '#2196F3';
            notification.style.color = 'white';
        }

        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            if (document.getElementById('claude-export-notification')) {
                document.body.removeChild(notification);
            }
        }, 5000);
    }

    async function exportConversation() {
        try {
            showLoadingIndicator('Exporting conversation and files...');
            
            exportedFiles = [];
            artifactElementsProcessed.clear();
            const fileCounter = { value: 1 };
            const timestampPrefix = generateTimestamp();
            
            // Step 1: Export PDFs
            logDebug('Step 1: Exporting PDFs...');
            const pdfs = await exportPDFs(timestampPrefix, fileCounter);
            exportedFiles.push(...pdfs);
            
            // Step 2: Export Document Artifacts
            logDebug('Step 2: Exporting document artifacts...');
            const documents = await exportDocumentArtifacts(timestampPrefix, fileCounter);
            exportedFiles.push(...documents);
            
            // Step 3: Export Interactive Artifacts
            logDebug('Step 3: Exporting interactive artifacts...');
            const interactives = await exportInteractiveArtifacts(timestampPrefix, fileCounter);
            exportedFiles.push(...interactives);
            
            // Step 4: Generate main markdown
            logDebug('Step 4: Generating main conversation markdown...');
            const markdown = await generateMarkdown();
            
            const chatTitle = getChatTitle() || 'Claude_Chat';
            const safeChatTitle = sanitizeFileName(chatTitle);
            const markdownFilename = `${timestampPrefix}_${safeChatTitle}.md`;
            
            const blob = new Blob([markdown], { type: 'text/markdown' });
            downloadFile(blob, markdownFilename);
            
            hideLoadingIndicator();
            
            const totalFiles = exportedFiles.length + 1;
            showNotification(`✓ Exported ${totalFiles} file(s) successfully!`, "success");
            
            logDebug(`Export complete! Files: ${totalFiles}`);
            logDebug(`PDFs: ${pdfs.length}, Documents: ${documents.length}, Interactive: ${interactives.length}`);
            
        } catch (error) {
            hideLoadingIndicator();
            showNotification(`✗ Export failed: ${error.message}`, "error");
            console.error('Export error:', error);
        }
    }

    async function exportMarkdownOnly() {
        try {
            showLoadingIndicator('Exporting markdown...');
            
            exportedFiles = [];
            artifactElementsProcessed.clear();
            const markdown = await generateMarkdown();
            
            const timestampPrefix = generateTimestamp();
            const chatTitle = getChatTitle() || 'Claude_Chat';
            const safeChatTitle = sanitizeFileName(chatTitle);
            const filename = `${timestampPrefix}_${safeChatTitle}.md`;

            const blob = new Blob([markdown], { type: 'text/markdown' });
            downloadFile(blob, filename);

            hideLoadingIndicator();
            showNotification('✓ Markdown exported successfully!', "success");
            
        } catch (error) {
            hideLoadingIndicator();
            showNotification(`✗ Export failed: ${error.message}`, "error");
            console.error('Export error:', error);
        }
    }

    function init() {
        logDebug("Initializing Enhanced Claude Exporter v6.1 (ALL ISSUES FIXED)");
        logDebug("Fixed: Complete documents, analyzed data, missing text, interactive artifacts");
        GM_registerMenuCommand('📥 Export Conversation + All Files', exportConversation);
        GM_registerMenuCommand('📄 Export Markdown Only', exportMarkdownOnly);
        logDebug("Ready!");
    }

    init();
})();
