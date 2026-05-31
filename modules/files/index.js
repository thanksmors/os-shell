import { adoptTailwind } from '/shell/shadow-tailwind.js';

const sampleTree = [
  { name: 'Documents', type: 'folder', children: [
    { name: 'notes.txt', type: 'file', size: '4 KB' },
    { name: 'resume.pdf', type: 'file', size: '128 KB' },
    { name: 'Projects', type: 'folder', children: [
      { name: 'alpine-shell', type: 'folder', children: [
        { name: 'index.html', type: 'file', size: '12 KB' },
        { name: 'README.md', type: 'file', size: '2 KB' },
      ]},
    ]},
  ]},
  { name: 'Pictures', type: 'folder', children: [
    { name: 'vacation.jpg', type: 'file', size: '3.2 MB' },
    { name: 'profile.png', type: 'file', size: '512 KB' },
    { name: 'wallpapers', type: 'folder', children: [
      { name: 'mountains.jpg', type: 'file', size: '5.1 MB' },
      { name: 'ocean.jpg', type: 'file', size: '4.7 MB' },
    ]},
  ]},
  { name: 'Music', type: 'folder', children: [
    { name: 'playlist.m3u', type: 'file', size: '1 KB' },
  ]},
  { name: 'Downloads', type: 'folder', children: [] },
  { name: 'README.md', type: 'file', size: '2 KB' },
  { name: '.bashrc', type: 'file', size: '1 KB' },
];

const FILE_ICONS = {
  folder: '📁',
  folderOpen: '📂',
  txt: '📄',
  pdf: '📕',
  jpg: '🖼',
  jpeg: '🖼',
  png: '🖼',
  gif: '🖼',
  mp3: '🎵',
  mp4: '🎬',
  m3u: '🎵',
  html: '🌐',
  js: '📜',
  css: '🎨',
  json: '📋',
  md: '📝',
  default: '📄',
};

function getFileIcon(node, expanded) {
  if (node.type === 'folder') return expanded ? FILE_ICONS.folderOpen : FILE_ICONS.folder;
  const ext = node.name.split('.').pop().toLowerCase();
  return FILE_ICONS[ext] || FILE_ICONS.default;
}

class FileTreeNode {
  constructor(node, depth, container, shadow) {
    this.node = node;
    this.depth = depth;
    this.container = container;
    this.shadow = shadow;
    this.expanded = false;
    this.selected = false;
    this.el = null;
    this.childContainer = null;
    this._render();
  }

  _render() {
    this.el = document.createElement('div');
    this.el.className = 'file-row';

    const row = document.createElement('div');
    row.className = 'file-row-inner';
    row.style.paddingLeft = `${this.depth * 16 + 8}px`;

    // Toggle arrow (for folders)
    const arrow = document.createElement('span');
    arrow.className = 'file-arrow';
    if (this.node.type === 'folder') {
      arrow.textContent = '▶';
      arrow.className = 'file-arrow file-arrow-folder';
    } else {
      arrow.innerHTML = '&nbsp;';
      arrow.className = 'file-arrow file-arrow-file';
    }

    // Icon
    const icon = document.createElement('span');
    icon.className = 'file-icon';
    icon.textContent = getFileIcon(this.node, this.expanded);

    // Name
    const name = document.createElement('span');
    name.className = 'file-name';
    name.textContent = this.node.name;

    // Size (files only)
    const size = document.createElement('span');
    size.className = 'file-size';
    size.textContent = this.node.size || (this.node.type === 'folder' ? '' : '—');

    row.appendChild(arrow);
    row.appendChild(icon);
    row.appendChild(name);
    row.appendChild(size);
    this.el.appendChild(row);

    // Children container
    if (this.node.type === 'folder') {
      this.childContainer = document.createElement('div');
      this.childContainer.className = 'file-children';
      this.childContainer.style.display = 'none';
      this.el.appendChild(this.childContainer);

      row.addEventListener('click', () => this._toggle());
    } else {
      row.addEventListener('click', () => this._select(row));
    }

    // Double click on file — "open" it
    row.addEventListener('dblclick', () => {
      if (this.node.type === 'file') {
        // find api from root
        const host = this.shadow.host;
        if (host && host.api) {
          host.api.notify(`📄 Opened: ${this.node.name}`, 'info');
        }
      }
    });

    this.container.appendChild(this.el);
  }

  _select(rowEl) {
    // deselect all
    const all = this.shadow.querySelectorAll('.file-row-inner.selected');
    all.forEach(r => r.classList.remove('selected'));
    rowEl.classList.add('selected');
  }

  _toggle() {
    this.expanded = !this.expanded;
    const arrow = this.el.querySelector('.file-arrow-folder');
    const iconEl = this.el.querySelector('.file-icon');
    if (arrow) arrow.textContent = this.expanded ? '▼' : '▶';
    if (iconEl) iconEl.textContent = getFileIcon(this.node, this.expanded);

    if (this.expanded) {
      this.childContainer.style.display = 'block';
      // Lazy render children
      if (this.childContainer.children.length === 0) {
        if (this.node.children && this.node.children.length > 0) {
          for (const child of this.node.children) {
            new FileTreeNode(child, this.depth + 1, this.childContainer, this.shadow);
          }
        } else {
          const empty = document.createElement('div');
          empty.className = 'file-empty';
          empty.style.paddingLeft = `${(this.depth + 1) * 16 + 8}px`;
          empty.textContent = 'Empty folder';
          this.childContainer.appendChild(empty);
        }
      }
    } else {
      this.childContainer.style.display = 'none';
    }
  }
}

class AppFiles extends HTMLElement {
  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this._render();
  }

  async _render() {
    const wrapper = document.createElement('div');
    wrapper.className = 'module-root files-root';

    // Toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'files-toolbar';
    toolbar.innerHTML = `
      <span style="font-size:1.1rem;">📁</span>
      <span style="font-weight:600;font-size:0.875rem;">Files</span>
      <div style="flex:1;"></div>
      <span style="font-size:0.75rem;color:#9ca3af;">Home</span>
    `;

    // Breadcrumb
    const breadcrumb = document.createElement('div');
    breadcrumb.className = 'files-breadcrumb';
    breadcrumb.innerHTML = `
      <span class="files-breadcrumb-item active">🏠 Home</span>
    `;

    // Tree container
    const treeContainer = document.createElement('div');
    treeContainer.className = 'files-tree';

    wrapper.appendChild(toolbar);
    wrapper.appendChild(breadcrumb);
    wrapper.appendChild(treeContainer);
    this._shadow.appendChild(wrapper);

    await adoptTailwind(this._shadow, wrapper);

    const style = document.createElement('style');
    try {
      const r = await fetch('/modules/files/styles.css');
      if (r.ok) style.textContent = await r.text();
    } catch (e) {}
    this._shadow.appendChild(style);

    // Render tree
    for (const node of sampleTree) {
      new FileTreeNode(node, 0, treeContainer, this._shadow);
    }
  }
}

customElements.define('app-files', AppFiles);
