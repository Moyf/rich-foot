import { Plugin, MarkdownView, debounce, Setting, PluginSettingTab, EditorView, FuzzySuggestModal } from 'obsidian';
import { ReleaseNotesModal } from './modals';
import { releaseNotes } from 'virtual:release-notes';

const DEFAULT_SETTINGS = {
    borderWidth: 1,
    borderStyle: "dashed",
    borderOpacity: 1,
    borderRadius: 15,
    datesOpacity: 1,
    linksOpacity: 1
};

class RichFootSettings {
    constructor() {
        this.excludedFolders = [];
        this.showBacklinks = true;
        this.showOutlinks = false;
        this.showDates = true;
        this.showReleaseNotes = true;
        this.lastVersion = null;
        this.borderWidth = DEFAULT_SETTINGS.borderWidth;
        this.borderStyle = DEFAULT_SETTINGS.borderStyle;
        this.borderOpacity = DEFAULT_SETTINGS.borderOpacity;
        this.borderRadius = DEFAULT_SETTINGS.borderRadius;
        this.datesOpacity = DEFAULT_SETTINGS.datesOpacity;
        this.linksOpacity = DEFAULT_SETTINGS.linksOpacity;
    }
}

class RichFootPlugin extends Plugin {
    async onload() {
        await this.loadSettings();

        // Set initial CSS custom properties
        document.documentElement.style.setProperty('--rich-foot-border-width', `${this.settings.borderWidth}px`);
        document.documentElement.style.setProperty('--rich-foot-border-style', this.settings.borderStyle);
        document.documentElement.style.setProperty('--rich-foot-border-opacity', this.settings.borderOpacity);
        document.documentElement.style.setProperty('--rich-foot-border-radius', `${this.settings.borderRadius}px`);
        document.documentElement.style.setProperty('--rich-foot-dates-opacity', this.settings.datesOpacity);
        document.documentElement.style.setProperty('--rich-foot-links-opacity', this.settings.linksOpacity);

        // Check version and show release notes if needed
        await this.checkVersion();

        this.updateRichFoot = debounce(this.updateRichFoot.bind(this), 100, true);

        this.addSettingTab(new RichFootSettingTab(this.app, this));

        // Wait for the layout to be ready before registering events
        this.app.workspace.onLayoutReady(() => {
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

            // Initial update
            this.updateRichFoot();
        });

        this.contentObserver = new MutationObserver(this.updateRichFoot);
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async checkVersion() {
        const currentVersion = this.manifest.version;
        const lastVersion = this.settings.lastVersion;

        if (this.settings.showReleaseNotes && 
            (!lastVersion || lastVersion !== currentVersion)) {
            
            // Get release notes for current version
            const releaseNotes = await this.getReleaseNotes(currentVersion);
            
            // Show the modal
            new ReleaseNotesModal(this.app, currentVersion, releaseNotes).open();
            
            // Update the last shown version
            this.settings.lastVersion = currentVersion;
            await this.saveSettings();
        }
    }

    async getReleaseNotes(version) {
        return releaseNotes;
    }

    updateRichFoot() {
        // Update CSS custom properties
        document.documentElement.style.setProperty('--rich-foot-border-width', `${this.settings.borderWidth}px`);
        document.documentElement.style.setProperty('--rich-foot-border-style', this.settings.borderStyle);
        document.documentElement.style.setProperty('--rich-foot-border-opacity', this.settings.borderOpacity);
        document.documentElement.style.setProperty('--rich-foot-border-radius', `${this.settings.borderRadius}px`);
        document.documentElement.style.setProperty('--rich-foot-dates-opacity', this.settings.datesOpacity);
        document.documentElement.style.setProperty('--rich-foot-links-opacity', this.settings.linksOpacity);

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

        // Check if the current file is in an excluded folder
        if (this.shouldExcludeFile(file.path)) {
            // Remove any existing Rich Foot if the file is now excluded
            const content = view.contentEl;
            let container;
            if (view.getMode() === 'preview') {
                container = content.querySelector('.markdown-preview-section');
            } else if (view.getMode() === 'source' || view.getMode() === 'live') {
                container = content.querySelector('.cm-sizer');
            }
            if (container) {
                this.removeExistingRichFoot(container);
            }
            return;
        }

        const content = view.contentEl;
        let container;

        if (view.getMode() === 'preview') {
            container = content.querySelector('.markdown-preview-section');
        } else if (view.getMode() === 'source' || view.getMode() === 'live') {
            container = content.querySelector('.cm-sizer');
        }

        if (!container) {
            return;
        }

        // Remove any existing Rich Foot
        this.removeExistingRichFoot(container);

        // Create the Rich Foot
        const richFoot = this.createRichFoot(file);

        // Append the Rich Foot to the container
        if (view.getMode() === 'source' || view.getMode() === 'live') {
            container.appendChild(richFoot);
        } else {
            container.appendChild(richFoot);
        }

        // Set up a mutation observer for this specific container
        this.observeContainer(container);
    }

    removeExistingRichFoot(container) {
        const existingRichFoot = container.querySelector('.rich-foot');
        if (existingRichFoot) {
            existingRichFoot.remove();
        }
        // Also check in .cm-sizer for editing mode
        const cmSizer = container.closest('.cm-editor')?.querySelector('.cm-sizer');
        if (cmSizer) {
            const richFootInSizer = cmSizer.querySelector('.rich-foot');
            if (richFootInSizer) {
                richFootInSizer.remove();
            }
        }
    }

    observeContainer(container) {
        if (this.containerObserver) {
            this.containerObserver.disconnect();
        }

        this.containerObserver = new MutationObserver((mutations) => {
            const richFoot = container.querySelector('.rich-foot');
            if (!richFoot) {
                this.addRichFoot(this.app.workspace.activeLeaf.view);
            }
        });

        this.containerObserver.observe(container, { childList: true, subtree: true });
    }

    createRichFoot(file) {
        const richFoot = createDiv({ cls: 'rich-foot' });
        const richFootDashedLine = richFoot.createDiv({ cls: 'rich-foot--dashed-line' });

        // Backlinks
        if (this.settings.showBacklinks) {
            const backlinksData = this.app.metadataCache.getBacklinksForFile(file);

            if (backlinksData?.data && backlinksData.data.size > 0) {
                const backlinksDiv = richFoot.createDiv({ cls: 'rich-foot--backlinks' });
                const backlinksUl = backlinksDiv.createEl('ul');

                for (const [linkPath, linkData] of backlinksData.data) {
                    if (!linkPath.endsWith('.md')) continue;

                    const li = backlinksUl.createEl('li');
                    const link = li.createEl('a', {
                        href: linkPath,
                        text: linkPath.split('/').pop().slice(0, -3)
                    });
                    link.addEventListener('click', (event) => {
                        event.preventDefault();
                        this.app.workspace.openLinkText(linkPath, file.path);
                    });
                }

                if (backlinksUl.childElementCount === 0) {
                    backlinksDiv.remove();
                }
            }
        }

        // Outlinks
        if (this.settings.showOutlinks) {
            const outlinks = this.getOutlinks(file);
            
            if (outlinks.size > 0) {
                const outlinksDiv = richFoot.createDiv({ cls: 'rich-foot--outlinks' });
                const outlinksUl = outlinksDiv.createEl('ul');

                for (const linkPath of outlinks) {
                    const parts = linkPath.split('/');
                    const displayName = parts[parts.length - 1].slice(0, -3);
                    
                    const li = outlinksUl.createEl('li');
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

        // Dates
        if (this.settings.showDates) {
            const datesWrapper = richFoot.createDiv({ cls: 'rich-foot--dates-wrapper' });

            const fileUpdate = new Date(file.stat.mtime);
            const modified = `${fileUpdate.toLocaleString('default', { month: 'long' })} ${fileUpdate.getDate()}, ${fileUpdate.getFullYear()}`;
            datesWrapper.createDiv({
                cls: 'rich-foot--modified-date',
                text: `${modified}`
            });

            const fileCreated = new Date(file.stat.ctime);
            const created = `${fileCreated.toLocaleString('default', { month: 'long' })} ${fileCreated.getDate()}, ${fileCreated.getFullYear()}`;
            datesWrapper.createDiv({
                cls: 'rich-foot--created-date',
                text: `${created}`
            });
        }

        return richFoot;
    }

    getOutlinks(file) {
        const cache = this.app.metadataCache.getFileCache(file);
        const links = new Set();
        
        // Check regular links in content
        if (cache?.links) {
            for (const link of cache.links) {
                const targetFile = this.app.metadataCache.getFirstLinkpathDest(link.link, file.path);
                if (targetFile && targetFile.extension === 'md') {
                    links.add(targetFile.path);
                }
            }
        }
        
        // Check frontmatter links
        if (cache?.frontmatter?.links) {
            const frontmatterLinks = cache.frontmatter.links;
            if (Array.isArray(frontmatterLinks)) {
                for (const link of frontmatterLinks) {
                    const linkText = link.match(/\[\[(.*?)\]\]/)?.[1];
                    if (linkText) {
                        const targetFile = this.app.metadataCache.getFirstLinkpathDest(linkText, file.path);
                        if (targetFile && targetFile.extension === 'md') {
                            links.add(targetFile.path);
                        }
                    }
                }
            }
        }
        
        return links;
    }

    onunload() {
        this.contentObserver.disconnect();
        if (this.richFootIntervalId) {
            clearInterval(this.richFootIntervalId);
        }
        if (this.containerObserver) {
            this.containerObserver.disconnect();
        }
    }

    // Add this method to check if a file should be excluded
    shouldExcludeFile(filePath) {
        return this.settings.excludedFolders.some(folder => filePath.startsWith(folder));
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

        containerEl.createEl('div', { cls: 'rich-foot-info', text: '🦶 Rich Foot adds a footer to your notes with useful information such as backlinks, creation date, and last modified date. Use the settings below to customize the appearance.' });

        // Excluded Folders Section with description
        containerEl.createEl('h3', { text: 'Excluded Folders' });
        containerEl.createEl('p', { 
            text: 'Notes in excluded folders (and their subfolders) will not display the Rich Foot footer. This is useful for system folders or areas where you don\'t want footer information to appear.',
            cls: 'setting-item-description'
        });
        
        // Create container for excluded folders list
        const excludedFoldersContainer = containerEl.createDiv('excluded-folders-container');
        
        // Display current excluded folders
        this.plugin.settings.excludedFolders.forEach((folder, index) => {
            const folderDiv = excludedFoldersContainer.createDiv('excluded-folder-item');
            folderDiv.createSpan({ text: folder });
            
            const deleteButton = folderDiv.createEl('button', {
                text: 'Delete',
                cls: 'excluded-folder-delete'
            });
            
            deleteButton.addEventListener('click', async () => {
                this.plugin.settings.excludedFolders.splice(index, 1);
                await this.plugin.saveSettings();
                this.display(); // Refresh the display
            });
        });

        // Add new folder section
        const newFolderSetting = new Setting(containerEl)
            .setName('Add excluded folder')
            .setDesc('Enter a folder path or browse to select')
            .addText(text => text
                .setPlaceholder('folder/subfolder')
                .onChange(() => {
                    // We'll handle the change in the add button
                }))
            .addButton(button => button
                .setButtonText('Browse')
                .onClick(async () => {
                    const folder = await this.browseForFolder();
                    if (folder) {
                        const textComponent = newFolderSetting.components[0];
                        textComponent.setValue(folder);
                    }
                }))
            .addButton(button => button
                .setButtonText('Add')
                .onClick(async () => {
                    const textComponent = newFolderSetting.components[0];
                    const newFolder = textComponent.getValue().trim();
                    
                    if (newFolder && !this.plugin.settings.excludedFolders.includes(newFolder)) {
                        this.plugin.settings.excludedFolders.push(newFolder);
                        await this.plugin.saveSettings();
                        textComponent.setValue('');
                        this.display(); // Refresh the display
                    }
                }));

        // Add visibility toggles
        containerEl.createEl('h3', { text: 'Visibility Settings' });

        new Setting(containerEl)
            .setName('Show Backlinks')
            .setDesc('Show backlinks in the footer')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showBacklinks)
                .onChange(async (value) => {
                    this.plugin.settings.showBacklinks = value;
                    await this.plugin.saveSettings();
                    this.plugin.updateRichFoot();
                }));

        new Setting(containerEl)
            .setName('Show Outlinks')
            .setDesc('Show outgoing links in the footer')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showOutlinks)
                .onChange(async (value) => {
                    this.plugin.settings.showOutlinks = value;
                    await this.plugin.saveSettings();
                    this.plugin.updateRichFoot();
                }));

        new Setting(containerEl)
            .setName('Show Dates')
            .setDesc('Show creation and modification dates in the footer')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showDates)
                .onChange(async (value) => {
                    this.plugin.settings.showDates = value;
                    await this.plugin.saveSettings();
                    this.plugin.updateRichFoot();
                }));

        // Border Settings
        containerEl.createEl('h3', { text: 'Style Settings' });

        // Border Width
        new Setting(containerEl)
            .setName('Border Width')
            .setDesc('Adjust the width of the footer border (1-10px)')
            .addSlider(slider => slider
                .setLimits(1, 10, 1)
                .setValue(this.plugin.settings.borderWidth)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.borderWidth = value;
                    await this.plugin.saveSettings();
                    this.plugin.updateRichFoot();
                }))
            .addButton(button => button
                .setButtonText('Reset')
                .onClick(async () => {
                    this.plugin.settings.borderWidth = DEFAULT_SETTINGS.borderWidth;
                    await this.plugin.saveSettings();
                    this.display();
                    this.plugin.updateRichFoot();
                }));

        // Border Style
        new Setting(containerEl)
            .setName('Border Style')
            .setDesc('Choose the style of the footer border')
            .addDropdown(dropdown => dropdown
                .addOptions({
                    'solid': 'Solid',
                    'dashed': 'Dashed',
                    'dotted': 'Dotted',
                    'double': 'Double',
                    'groove': 'Groove',
                    'ridge': 'Ridge',
                    'inset': 'Inset',
                    'outset': 'Outset'
                })
                .setValue(this.plugin.settings.borderStyle)
                .onChange(async (value) => {
                    this.plugin.settings.borderStyle = value;
                    await this.plugin.saveSettings();
                    this.plugin.updateRichFoot();
                }))
            .addButton(button => button
                .setButtonText('Reset')
                .onClick(async () => {
                    this.plugin.settings.borderStyle = DEFAULT_SETTINGS.borderStyle;
                    await this.plugin.saveSettings();
                    this.display();
                    this.plugin.updateRichFoot();
                }));

        // Border Opacity
        new Setting(containerEl)
            .setName('Border Opacity')
            .setDesc('Adjust the opacity of the footer border (0-1)')
            .addSlider(slider => slider
                .setLimits(0, 1, 0.1)
                .setValue(this.plugin.settings.borderOpacity)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.borderOpacity = value;
                    await this.plugin.saveSettings();
                    this.plugin.updateRichFoot();
                }))
            .addButton(button => button
                .setButtonText('Reset')
                .onClick(async () => {
                    this.plugin.settings.borderOpacity = DEFAULT_SETTINGS.borderOpacity;
                    await this.plugin.saveSettings();
                    this.display();
                    this.plugin.updateRichFoot();
                }));

        // Link Border Radius
        new Setting(containerEl)
            .setName('Link Border Radius')
            .setDesc('Adjust the border radius of Backlinks and Outlinks (0-15px)')
            .addSlider(slider => slider
                .setLimits(0, 15, 1)
                .setValue(this.plugin.settings.borderRadius)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.borderRadius = value;
                    await this.plugin.saveSettings();
                    this.plugin.updateRichFoot();
                }))
            .addButton(button => button
                .setButtonText('Reset')
                .onClick(async () => {
                    this.plugin.settings.borderRadius = DEFAULT_SETTINGS.borderRadius;
                    await this.plugin.saveSettings();
                    this.display();
                    this.plugin.updateRichFoot();
                }));

        // Links Opacity
        new Setting(containerEl)
            .setName('Links Opacity')
            .setDesc('Adjust the opacity of Backlinks and Outlinks (0-1)')
            .addSlider(slider => slider
                .setLimits(0, 1, 0.1)
                .setValue(this.plugin.settings.linksOpacity)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.linksOpacity = value;
                    await this.plugin.saveSettings();
                    this.plugin.updateRichFoot();
                }))
            .addButton(button => button
                .setButtonText('Reset')
                .onClick(async () => {
                    this.plugin.settings.linksOpacity = DEFAULT_SETTINGS.linksOpacity;
                    await this.plugin.saveSettings();
                    this.display();
                    this.plugin.updateRichFoot();
                }));

        // Dates Opacity
        new Setting(containerEl)
            .setName('Dates Opacity')
            .setDesc('Adjust the opacity of the Created / Modified Dates (0-1)')
            .addSlider(slider => slider
                .setLimits(0, 1, 0.1)
                .setValue(this.plugin.settings.datesOpacity)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.datesOpacity = value;
                    await this.plugin.saveSettings();
                    this.plugin.updateRichFoot();
                }))
            .addButton(button => button
                .setButtonText('Reset')
                .onClick(async () => {
                    this.plugin.settings.datesOpacity = DEFAULT_SETTINGS.datesOpacity;
                    await this.plugin.saveSettings();
                    this.display();
                    this.plugin.updateRichFoot();
                }));

        // Add Example Screenshot section
        containerEl.createEl('h3', { text: 'Example Screenshot', cls: 'rich-foot-example-title' });
        const exampleDiv = containerEl.createDiv({ cls: 'rich-foot-example' });
        const img = exampleDiv.createEl('img', {
            attr: {
                src: 'https://raw.githubusercontent.com/jparkerweb/rich-foot/refs/heads/main/rich-foot.jpg',
                alt: 'Rich Foot Example'
            }
        });
    }

    async browseForFolder() {
        // Get all folders in the vault
        const folders = this.app.vault.getAllLoadedFiles()
            .filter(file => file.children) // Only get folders
            .map(folder => folder.path);
        
        // Create and show a suggestion modal
        return new Promise(resolve => {
            const modal = new FolderSuggestModal(this.app, folders, (result) => {
                resolve(result);
            });
            modal.open();
        });
    }
}

// Add this new class for the folder picker modal
class FolderSuggestModal extends FuzzySuggestModal {
    constructor(app, folders, onChoose) {
        super(app);
        this.folders = folders;
        this.onChoose = onChoose;
    }

    getItems() {
        return this.folders;
    }

    getItemText(item) {
        return item;
    }

    onChooseItem(item, evt) {
        this.onChoose(item);
    }
}

export default RichFootPlugin;
