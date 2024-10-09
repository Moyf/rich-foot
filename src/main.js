const { Plugin, MarkdownView, debounce, Setting, PluginSettingTab, EditorView } = require('obsidian');

class RichFootSettings {
    constructor() {
        this.excludedFolders = [];
    }
}

class RichFootPlugin extends Plugin {
    async onload() {
        await this.loadSettings();

        this.updateRichFoot = debounce(this.updateRichFoot.bind(this), 100, true);

        this.addSettingTab(new RichFootSettingTab(this.app, this));

        this.registerEvent(
            this.app.workspace.on('layout-change', this.updateRichFoot)
        );

        this.registerEvent(
            this.app.workspace.on('active-leaf-change', this.updateRichFoot)
        );

        this.registerEvent(
            this.app.workspace.on('file-open', this.updateRichFoot)
        );

        this.registerEvent(
            this.app.workspace.on('editor-change', this.updateRichFoot)
        );

        this.contentObserver = new MutationObserver(this.updateRichFoot);
    }

    async loadSettings() {
        this.settings = Object.assign(new RichFootSettings(), await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    updateRichFoot() {
        const activeLeaf = this.app.workspace.activeLeaf;
        if (activeLeaf && activeLeaf.view instanceof MarkdownView) {
            this.addRichFoot(activeLeaf.view);
        }
    }

    addRichFoot(view) {
        const file = view.file;
        if (!file || !file.path) {
            return;
        }

        const content = view.contentEl;
        let container;

        if (view.getMode() === 'preview') {
            container = content.querySelector('.markdown-preview-section');
        } else if (view.getMode() === 'source' || view.getMode() === 'live') {
            const cmSizer = content.querySelector('.cm-sizer');
            if (cmSizer) {
                // Remove any existing Rich Foot
                this.removeExistingRichFoot(cmSizer);
                
                // Create the Rich Foot
                const richFoot = this.createRichFoot(file);
                
                // Append the Rich Foot as the last child of cm-sizer
                cmSizer.appendChild(richFoot);
                
                // Observe the cm-sizer for changes
                this.contentObserver.disconnect();
                this.contentObserver.observe(cmSizer, { childList: true, subtree: true });
                
                return; // Exit the method early as we've already added the Rich Foot
            }
        }

        if (!container) {
            return;
        }

        // Remove any existing Rich Foot
        this.removeExistingRichFoot(container);

        // Create and add the Rich Foot
        const richFoot = this.createRichFoot(file);
        container.appendChild(richFoot);

        // Observe the container for changes
        this.contentObserver.disconnect();
        this.contentObserver.observe(container, { childList: true, subtree: true });
    }

    removeExistingRichFoot(container) {
        const existingRichFoot = container.querySelector('.rich-foot');
        if (existingRichFoot) {
            existingRichFoot.remove();
        }
    }

    createRichFoot(file) {
        const richFoot = createDiv({ cls: 'rich-foot' });

        // Backlinks
        const backlinkList = this.app.metadataCache.getBacklinksForFile(file);

        if (backlinkList && backlinkList.data && Object.keys(backlinkList.data).length > 0) {
            const backlinksDiv = richFoot.createDiv({ cls: 'rich-foot--backlinks' });
            const backlinksUl = backlinksDiv.createEl('ul');

            for (const [linkPath, backlinks] of Object.entries(backlinkList.data)) {
                if (this.shouldIncludeBacklink(linkPath)) {
                    const parts = linkPath.split('/');
                    const displayName = parts[parts.length - 1].slice(0, -3); // Remove '.md'
                    
                    const li = backlinksUl.createEl('li');
                    const link = li.createEl('a', {
                        href: linkPath,
                        text: displayName
                    });
                    link.addEventListener('click', (event) => {
                        event.preventDefault();
                        this.app.workspace.openLinkText(linkPath, file.path);
                    });
                }
            }
        }

        // Modified date
        const fileUpdate = new Date(file.stat.mtime);
        const modified = `${fileUpdate.toLocaleString('default', { month: 'long' })} ${fileUpdate.getDate()}, ${fileUpdate.getFullYear()}`;
        richFoot.createDiv({
            cls: 'rich-foot--modified-date',
            text: `${modified}`
        });

        // Created date
        const fileCreated = new Date(file.stat.ctime);
        const created = `${fileCreated.toLocaleString('default', { month: 'long' })} ${fileCreated.getDate()}, ${fileCreated.getFullYear()}`;
        richFoot.createDiv({
            cls: 'rich-foot--created-date',
            text: `${created}`
        });

        return richFoot;
    }

    shouldIncludeBacklink(linkPath) {
        return !this.settings.excludedFolders.some(folder => linkPath.startsWith(folder));
    }

    onunload() {
        this.contentObserver.disconnect();
    }
}

class RichFootSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        let { containerEl } = this;
        containerEl.empty();
        containerEl.addClass('rich-foot-settings');

        // Add informative text
        const infoDiv = containerEl.createEl('div', { cls: 'rich-foot-info' });
        infoDiv.createEl('p', { text: 'Rich Foot adds a footer to your notes with useful information such as backlinks, creation date, and last modified date.' });

        new Setting(containerEl)
            .setName('Excluded folders')
            .setDesc('Enter folder paths to exclude from backlinks (one per line)')
            .addTextArea(text => text
                .setPlaceholder('folder1\nfolder2/subfolder')
                .setValue(this.plugin.settings.excludedFolders.join('\n'))
                .onChange(async (value) => {
                    this.plugin.settings.excludedFolders = value.split('\n').filter(folder => folder.trim() !== '');
                    await this.plugin.saveSettings();
                })
            );

        // Update the textarea size
        const textArea = containerEl.querySelector('textarea');
        if (textArea) {
            textArea.style.width = '400px';
            textArea.style.height = '250px';
        }
    }
}

module.exports = RichFootPlugin;