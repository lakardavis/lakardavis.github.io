document.addEventListener('DOMContentLoaded', () => {
    const homeView = document.getElementById('homeView');
    const phaseView = document.getElementById('phaseView');
    const phaseGrid = document.getElementById('phaseGrid');
    const checklistContainer = document.getElementById('checklistContainer');
    const saveIndicator = document.getElementById('saveIndicator');
    const backBtn = document.getElementById('backBtn');
    const resetBtn = document.getElementById('resetBtn');

    let parsedLines = [];
    let phases = [];
    let currentPhaseIndex = -1;
    let isDragging = false;
    let dragCheckState = false;
    let dragChanged = false;

    // Navigation Events
    backBtn.addEventListener('click', showHome);

    // Reset Data Event
    if (resetBtn) {
        resetBtn.addEventListener('click', resetAllProgress);
    }

    window.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            // Re-render only on drag completion
            if (dragChanged && currentPhaseIndex !== -1) {
                const phase = phases[currentPhaseIndex];
                renderChecklist(phase.startIndex, phase.endIndex);
                autoSave();
                dragChanged = false;
            }
        }
    });

    // Cookie Modal Logic
    const cookieModal = document.getElementById('cookieModal');
    const acceptBtn = document.getElementById('acceptCookiesBtn');

    if (!localStorage.getItem('cookieConsent')) {
        cookieModal.classList.remove('hidden');
    }

    if (acceptBtn) {
        acceptBtn.addEventListener('click', () => {
            localStorage.setItem('cookieConsent', 'true');
            cookieModal.classList.add('hidden');
        });
    }

    // Fetch the Markdown on load
    const savedMarkdown = localStorage.getItem('crazyCraftProgress');

    if (savedMarkdown) {
        parseMarkdown(savedMarkdown);
        renderHome();
    } else {
        fetch('Crazy Craft Prog.md')
            .then(response => {
                if (!response.ok) throw new Error('Markdown file not found');
                return response.text();
            })
            .then(text => {
                parseMarkdown(text);
                renderHome();
            })
            .catch(error => {
                phaseGrid.innerHTML = `<div class="info-text">Error loading data: ${error.message}. Ensure 'Crazy Craft Prog.md' is placed in the same directory.</div>`;
            });
    }

    function parseMarkdown(text) {
        const lines = text.split('\n');
        parsedLines = [];
        phases = [];

        let currentPhase = null;
        let currentSectionHeaderIndex = -1;

        const taskRegex = /^(\s*)([\*\-] \[[xX ]\] |[\*\-] )(.*)/;
        const phaseHeaderRegex = /^#\s+(.*)/;
        const subHeaderRegex = /^(#{2,6})\s+(.*)/;
        const hrRegex = /^(---|\*\*\*)$/;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Look for Phase Break (H1)
            const phaseMatch = line.match(phaseHeaderRegex);
            if (phaseMatch) {
                let title = phaseMatch[1];
                let status = "Not Started";

                // Clean the title for the card view
                const statusTags = ['Not Started', 'In Progress', 'Completed'];
                for (let tag of statusTags) {
                    if (title.trim().endsWith(tag)) {
                        status = tag;
                        title = title.substring(0, title.length - tag.length).trim();
                        break;
                    }
                }

                currentPhase = {
                    title: title,
                    status: status,
                    startIndex: parsedLines.length,
                    endIndex: parsedLines.length,
                    taskCount: 0,
                    completedCount: 0,
                    sectionCount: 0,
                    completedSectionCount: 0
                };
                phases.push(currentPhase);
                currentSectionHeaderIndex = -1;

                parsedLines.push({
                    type: 'phase_header',
                    content: phaseMatch[1],
                    original: line
                });
                continue;
            }

            // Look for Sub Headers (H2+)
            const subMatch = line.match(subHeaderRegex);
            if (subMatch) {
                const level = subMatch[1].length;

                parsedLines.push({
                    type: 'header',
                    level: level,
                    content: subMatch[2],
                    original: line,
                    taskCount: 0,
                    completedCount: 0,
                    countedAsCompleted: false
                });

                if (level === 2) {
                    currentSectionHeaderIndex = parsedLines.length - 1;
                    if (currentPhase) currentPhase.sectionCount++;
                }

                if (currentPhase) currentPhase.endIndex = parsedLines.length - 1;
                continue;
            }

            // Check for hr
            if (hrRegex.test(line.trim())) {
                parsedLines.push({ type: 'hr', original: line });
                if (currentPhase) currentPhase.endIndex = parsedLines.length - 1;
                continue;
            }

            // Check for Tasks
            const taskMatch = line.match(taskRegex);
            if (taskMatch) {
                const indentStr = taskMatch[1];
                const marker = taskMatch[2];
                const checked = marker.includes('[x]') || marker.includes('[X]');
                const isStar = marker.startsWith('*');

                if (currentPhase) {
                    currentPhase.taskCount++;
                    if (checked) currentPhase.completedCount++;
                }

                // Update section counts
                if (currentSectionHeaderIndex !== -1) {
                    parsedLines[currentSectionHeaderIndex].taskCount++;
                    if (checked) parsedLines[currentSectionHeaderIndex].completedCount++;
                }

                parsedLines.push({
                    type: 'task',
                    indent: indentStr,
                    isStar: isStar,
                    checked: checked,
                    content: taskMatch[3],
                    original: line,
                    parentSectionIndex: currentSectionHeaderIndex
                });
                if (currentPhase) currentPhase.endIndex = parsedLines.length - 1;
                continue;
            }

            // Normal Text / Instructions
            const indentMatch = line.match(/^(\s+)/);
            parsedLines.push({
                type: 'text',
                indent: indentMatch ? indentMatch[1] : '',
                content: line.trim() ? line : '',
                original: line
            });
            if (currentPhase) currentPhase.endIndex = parsedLines.length - 1;
        }

        // Auto-update phase statuses AND section counts globally
        phases.forEach((p, idx) => {
            // Recalculate section completions globally for home render
            p.completedSectionCount = 0;
            for (let i = p.startIndex; i <= p.endIndex; i++) {
                const item = parsedLines[i];
                if (item.type === 'header' && item.level === 2 && item.taskCount > 0) {
                    if (item.taskCount === item.completedCount) {
                        p.completedSectionCount++;
                    }
                }
            }

            if (p.taskCount > 0) {
                if (p.completedCount === 0) p.status = "Not Started";
                else if (p.completedCount === p.taskCount) p.status = "Completed";
                else p.status = "In Progress";

                const headerLine = parsedLines[p.startIndex];
                const cleanedTitle = p.title;
                headerLine.original = `# ${cleanedTitle} ${p.status}`;
                headerLine.content = `${cleanedTitle} ${p.status}`;
            }
        });
    }

    function renderHome() {
        phaseGrid.innerHTML = '';

        if (phases.length === 0) {
            phaseGrid.innerHTML = `<div class="info-text">No phases found. Make sure your headers start with a single '#'.</div>`;
            return;
        }

        phases.forEach((phase, index) => {
            const card = document.createElement('div');
            card.className = 'phase-card';

            let isUnlocked = true;
            if (index > 0) {
                const prevPhase = phases[index - 1];
                if (prevPhase.status !== 'Completed') {
                    isUnlocked = false;
                }

                // Exception for Fun/Miscellaneous phases
                const titleLower = phase.title.toLowerCase();
                if (titleLower.includes('fun') || titleLower.includes('misslanious') || titleLower.includes('miscellaneous')) {
                    isUnlocked = true;
                }
            }
            phase.isUnlocked = isUnlocked;

            card.onclick = () => showPhase(index);
            if (!isUnlocked) {
                card.classList.add('locked');
            }

            if (phase.status === 'Completed') {
                card.classList.add('card-completed');
            }

            if (!isUnlocked) {
                const lockContainer = document.createElement('div');
                lockContainer.className = 'lock-icon-container';
                lockContainer.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`;
                card.appendChild(lockContainer);
            }

            const title = document.createElement('div');
            title.className = 'phase-card-title';
            title.textContent = phase.title.replace(/\*\*/g, '');
            card.appendChild(title);

            const infoTasks = document.createElement('div');
            infoTasks.className = 'phase-card-info';
            infoTasks.textContent = `${phase.completedCount} / ${phase.taskCount} tasks`;
            card.appendChild(infoTasks);

            const infoSec = document.createElement('div');
            infoSec.className = 'phase-card-info';
            if (phase.sectionCount > 0) {
                infoSec.textContent = `${phase.completedSectionCount} / ${phase.sectionCount} sections`;
            } else {
                infoSec.textContent = `0 sections`; // or blank, but showing explicit 0 is sometimes nice
            }
            card.appendChild(infoSec);

            const statusContainer = document.createElement('div');
            const statusClass = phase.status.toLowerCase().replace(' ', '-');
            statusContainer.className = `phase-card-status status-${statusClass}`;
            statusContainer.textContent = phase.status;
            card.appendChild(statusContainer);

            // Render Progress Bar
            const barTrack = document.createElement('div');
            barTrack.className = 'card-progress-track';

            const barFill = document.createElement('div');
            barFill.className = 'card-progress-fill';

            let percent = 0;
            if (phase.taskCount > 0) {
                percent = (phase.completedCount / phase.taskCount) * 100;
            }
            // slight delay lets the css transition animate it drawing loaded state
            setTimeout(() => {
                barFill.style.width = `${percent}%`;
            }, 50);

            barTrack.appendChild(barFill);
            card.appendChild(barTrack);

            phaseGrid.appendChild(card);
        });
    }

    function showPhase(index) {
        currentPhaseIndex = index;
        const phase = phases[index];

        homeView.classList.add('hidden');
        homeView.classList.remove('active');

        phaseView.classList.remove('hidden');

        setTimeout(() => {
            phaseView.classList.add('active');
        }, 50);

        backBtn.classList.remove('hidden');

        if (!phase.isUnlocked) {
            checklistContainer.classList.add('checklist-locked');
        } else {
            checklistContainer.classList.remove('checklist-locked');
        }

        renderChecklist(phase.startIndex, phase.endIndex);
    }

    function showHome() {
        parseMarkdown(generateMarkdownString());
        renderHome();

        phaseView.classList.remove('active');

        setTimeout(() => {
            phaseView.classList.add('hidden');
            homeView.classList.remove('hidden');

            setTimeout(() => {
                homeView.classList.add('active');
            }, 50);
        }, 300);

        backBtn.classList.add('hidden');
        currentPhaseIndex = -1;
    }

    function cleanMarkdownDisplay(text) {
        let safeText = escapeHtml(text);

        // Handle bold
        safeText = safeText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

        // Handle italics / tips
        safeText = safeText.replace(/\*(.*?)\*/g, '<span class="markdown-tip">$1</span>');

        return safeText;
    }

    function renderChecklist(startIndex, endIndex) {
        checklistContainer.innerHTML = '';

        let wikiBlock = null;

        const isCurrentlyLocked = currentPhaseIndex !== -1 && !phases[currentPhaseIndex].isUnlocked;

        for (let i = startIndex; i <= endIndex; i++) {
            const item = parsedLines[i];

            // Indention
            let indentClass = '';
            if (item.indent) {
                const spaces = item.indent.length;
                if (spaces >= 8) indentClass = 'indent-3';
                else if (spaces >= 4) indentClass = 'indent-2';
                else if (spaces > 0) indentClass = 'indent-1';
            }

            // Flush wiki block
            if (item.type !== 'text' || !item.content.trim()) {
                if (wikiBlock) {
                    checklistContainer.appendChild(wikiBlock);
                    wikiBlock = null;
                }
            }

            if (item.type === 'hr') {
                const hr = document.createElement('hr');
                hr.className = 'markdown-separator';
                checklistContainer.appendChild(hr);
            }
            else if (item.type === 'phase_header') {
                const h = document.createElement('h1');
                h.className = 'section-header';
                let displayContent = item.content;
                ['Not Started', 'In Progress', 'Completed'].forEach(tag => {
                    if (displayContent.endsWith(tag)) displayContent = displayContent.substring(0, displayContent.length - tag.length).trim();
                });

                h.innerHTML = cleanMarkdownDisplay(displayContent);

                if (isCurrentlyLocked) {
                    h.innerHTML += ' <span style="font-size: 0.8rem; opacity: 0.6; vertical-align: middle;">(READ ONLY)</span>';
                }

                checklistContainer.appendChild(h);
            }
            else if (item.type === 'header') {
                const h = document.createElement(`h${item.level}`);
                h.className = 'sub-header';
                h.id = `section-header-${i}`;

                let displayContent = item.content;
                ['Not Started', 'In Progress', 'Completed'].forEach(tag => {
                    if (displayContent.endsWith(tag)) displayContent = displayContent.substring(0, displayContent.length - tag.length).trim();
                });

                const headerTextContainer = document.createElement('span');
                headerTextContainer.className = 'header-text-container';
                headerTextContainer.innerHTML = cleanMarkdownDisplay(displayContent);
                h.appendChild(headerTextContainer);

                if (item.taskCount > 0) {
                    const isAllDone = item.completedCount === item.taskCount;

                    if (isAllDone) {
                        h.classList.add('section-completed');
                        const badge = document.createElement('span');
                        badge.className = 'header-check';
                        badge.textContent = '✓ Completed';
                        h.appendChild(badge);
                    }

                    const checkAllBtn = document.createElement('button');
                    checkAllBtn.className = 'check-all-btn';
                    checkAllBtn.title = isAllDone ? 'Uncheck entire section' : 'Check entire section';

                    if (isAllDone) {
                        checkAllBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
                        checkAllBtn.classList.add('uncheck-mode');
                    } else {
                        checkAllBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline><polyline points="18 6 10 14"></polyline></svg>`;
                    }

                    if (!isCurrentlyLocked) {
                        checkAllBtn.onclick = () => toggleEntireSection(i);
                        h.appendChild(checkAllBtn);
                    }
                }

                checklistContainer.appendChild(h);
            }
            else if (item.type === 'task') {
                const div = document.createElement('div');
                div.className = `task-item ${item.checked ? 'completed' : ''} ${indentClass}`;

                const wrapper = document.createElement('div');
                wrapper.className = 'checkbox-wrapper';

                let checkbox = null;
                if (isCurrentlyLocked) {
                    const lockIcon = document.createElement('div');
                    lockIcon.className = 'task-lock-icon';
                    lockIcon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`;
                    wrapper.appendChild(lockIcon);
                } else {
                    checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.checked = item.checked;
                    checkbox.style.pointerEvents = 'none'; // div handles all clicks
                    wrapper.appendChild(checkbox);
                }

                div.appendChild(wrapper);

                const text = document.createElement('div');
                text.className = 'task-text';
                text.innerHTML = cleanMarkdownDisplay(item.content);
                div.appendChild(text);

                div.addEventListener('mousedown', (e) => {
                    const isCurrentlyLocked = currentPhaseIndex !== -1 && !phases[currentPhaseIndex].isUnlocked;
                    if (isCurrentlyLocked) return;

                    e.preventDefault(); // prevent text selection highlighting
                    isDragging = true;
                    dragCheckState = !item.checked;
                    toggleTaskLocal(i, div, checkbox, dragCheckState);
                });

                div.addEventListener('mouseenter', () => {
                    const isCurrentlyLocked = currentPhaseIndex !== -1 && !phases[currentPhaseIndex].isUnlocked;
                    if (isCurrentlyLocked) return;

                    if (isDragging) {
                        toggleTaskLocal(i, div, checkbox, dragCheckState);
                    }
                });

                checklistContainer.appendChild(div);
            }
            else if (item.type === 'text') {
                if (item.content.trim()) {
                    if (!wikiBlock) {
                        wikiBlock = document.createElement('div');
                        wikiBlock.className = `wiki-instruction ${indentClass}`;
                    }

                    const p = document.createElement('p');
                    let content = cleanMarkdownDisplay(item.content.trim());

                    if (content.endsWith(':')) {
                        p.className = 'wiki-title';
                    }

                    p.innerHTML = content;
                    wikiBlock.appendChild(p);
                } else if (item.original.length === 0) {
                    const br = document.createElement('div');
                    br.style.height = '10px';
                    checklistContainer.appendChild(br);
                }
            }
        }

        if (wikiBlock) {
            checklistContainer.appendChild(wikiBlock);
        }
    }

    function toggleTaskLocal(index, div, checkbox, isChecked) {
        const item = parsedLines[index];
        if (item.checked === isChecked) return;

        item.checked = isChecked;
        checkbox.checked = isChecked;
        if (isChecked) div.classList.add('completed');
        else div.classList.remove('completed');

        if (currentPhaseIndex !== -1) {
            const phase = phases[currentPhaseIndex];

            if (isChecked) phase.completedCount++;
            else phase.completedCount--;

            if (phase.completedCount === 0) phase.status = "Not Started";
            else if (phase.completedCount === phase.taskCount) phase.status = "Completed";
            else phase.status = "In Progress";

            const headerLine = parsedLines[phase.startIndex];
            headerLine.original = `# ${phase.title} ${phase.status}`;
            headerLine.content = `${phase.title} ${phase.status}`;

            if (item.parentSectionIndex !== -1) {
                const sec = parsedLines[item.parentSectionIndex];
                if (isChecked) sec.completedCount++;
                else sec.completedCount--;
            }
        }

        dragChanged = true;
    }

    function toggleEntireSection(headerIndex) {
        const header = parsedLines[headerIndex];
        const isCurrentlyCompleted = (header.completedCount === header.taskCount);
        const newState = !isCurrentlyCompleted;

        let changed = false;
        for (let i = headerIndex + 1; i < parsedLines.length; i++) {
            const item = parsedLines[i];
            if (item.type === 'phase_header') break;
            if (item.type === 'task' && item.parentSectionIndex === headerIndex) {
                if (item.checked !== newState) {
                    item.checked = newState;
                    if (currentPhaseIndex !== -1) {
                        if (newState) {
                            phases[currentPhaseIndex].completedCount++;
                            header.completedCount++;
                        } else {
                            phases[currentPhaseIndex].completedCount--;
                            header.completedCount--;
                        }
                    }
                    changed = true;
                }
            }
        }

        if (changed && currentPhaseIndex !== -1) {
            const phase = phases[currentPhaseIndex];
            if (phase.completedCount === 0) phase.status = "Not Started";
            else if (phase.completedCount === phase.taskCount) phase.status = "Completed";
            else phase.status = "In Progress";

            const headerLine = parsedLines[phase.startIndex];
            headerLine.original = `# ${phase.title} ${phase.status}`;
            headerLine.content = `${phase.title} ${phase.status}`;

            renderChecklist(phase.startIndex, phase.endIndex);
            autoSave();
        }
    }

    function generateMarkdownString() {
        let textContent = '';
        for (let i = 0; i < parsedLines.length; i++) {
            const item = parsedLines[i];

            if (item.type === 'task') {
                const marker = item.isStar ? '*' : '-';
                const box = item.checked ? '[x]' : '[ ]';
                textContent += `${item.indent}${marker} ${box} ${item.content}\n`;
            } else {
                textContent += `${item.original}\n`;
            }
        }
        if (textContent.endsWith('\n')) {
            textContent = textContent.slice(0, -1);
        }
        return textContent;
    }

    function autoSave() {
        const textContent = generateMarkdownString();
        try {
            localStorage.setItem('crazyCraftProgress', textContent);
            showSaveIndicator();
        } catch (err) {
            console.error('Save error:', err);
        }
    }

    function showSaveIndicator() {
        saveIndicator.classList.add('visible');
        setTimeout(() => {
            saveIndicator.classList.remove('visible');
        }, 2000);
    }

    function escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function resetAllProgress() {
        if (!confirm("Are you sure you want to completely RESET your entire Crazy Craft progression? This cannot be undone!")) {
            return;
        }

        // Clear local storage completely and refresh to pull the raw .md file again
        localStorage.removeItem('crazyCraftProgress');
        location.reload();
    }
});
