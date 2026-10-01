(() => {
  const article = document.querySelector('#doc-article');
  const tree = document.querySelector('#categoryTree');
  const toc = document.querySelector('#tableOfContents');
  const search = document.querySelector('#docSearch');
  const count = document.querySelector('#docCount');
  const sidebar = document.querySelector('#docsSidebar');
  const sidebarToggle = document.querySelector('#sidebarToggle');
  const closeSidebar = document.querySelector('#closeSidebar');
  const backdrop = document.querySelector('#sidebarBackdrop');
  let manifest = [];
  let mathPreamble = '';
  let mathJaxPromise;

  const escapeHtml = (value = '') => value.replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const slugify = value => value.toLowerCase().trim().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-');

  function usablePreamble(source) {
    return source
      .replace(/^\s*%.*$/gm, '')
      .replace(/^\s*\\usepackage(?:\[[^\]]*\])?\{[^}]+\}\s*$/gm, '')
      .trim();
  }

  function mathSource(expression) {
    const prefix = mathPreamble ? `${mathPreamble}\n` : '';
    return escapeHtml(prefix + expression.trim());
  }

  function ensureMathJax() {
    if (window.MathJax?.typesetPromise) return Promise.resolve(window.MathJax);
    if (mathJaxPromise) return mathJaxPromise;
    window.MathJax = {
      loader: {load: ['[tex]/ams', '[tex]/newcommand', '[tex]/mathtools']},
      tex: {
        packages: {'[+]': ['ams', 'newcommand', 'mathtools']},
        inlineMath: [['\\(', '\\)']],
        displayMath: [['\\[', '\\]']]
      },
      options: {skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code']}
    };
    mathJaxPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js';
      script.async = true;
      script.onload = () => resolve(window.MathJax);
      script.onerror = () => reject(new Error('수식 렌더러를 불러오지 못했습니다.'));
      document.head.append(script);
    });
    return mathJaxPromise;
  }

  function parseFrontMatter(source) {
    source = source.replace(/^<!-- raw-markdown -->\s*/, '');
    if (!source.startsWith('---\n')) return {meta: {}, body: source};
    const end = source.indexOf('\n---\n', 4);
    if (end < 0) return {meta: {}, body: source};
    const meta = {};
    source.slice(4, end).split('\n').forEach(line => {
      const split = line.indexOf(':');
      if (split < 0) return;
      const key = line.slice(0, split).trim();
      let value = line.slice(split + 1).trim();
      if (value.startsWith('[') && value.endsWith(']')) value = value.slice(1, -1).split(',').map(v => v.trim());
      meta[key] = value;
    });
    return {meta, body: source.slice(end + 5)};
  }

  function inline(text) {
    const expressions = [];
    text = text.replace(/(^|[^\\])\$([^$\n]+)\$/g, (_, prefix, expression) => {
      const token = `@@MATH${expressions.length}@@`;
      expressions.push(expression);
      return prefix + token;
    });
    let out = escapeHtml(text);
    out = out.replace(/&lt;br\s*\/?&gt;/gi, "<br>");
    out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    out = out.replace(/\[([^\]]+)\]\(([^\s)]+)\)/g, '<a href="$2">$1</a>');
    expressions.forEach((expression, index) => {
      out = out.replace(`@@MATH${index}@@`, `<span class="math-inline">\\(${mathSource(expression)}\\)</span>`);
    });
    return out;
  }

  function markdown(source) {
    const lines = source.replace(/\r/g, '').split('\n');
    const html = [];
    let paragraph = [];
    let listType = null;
    let inCode = false;
    let codeLang = '';
    let code = [];
    let inTable = false;
    let inMath = false;
    let math = [];

    const flushParagraph = () => {
      if (paragraph.length) html.push(`<p>${inline(paragraph.join(' '))}</p>`);
      paragraph = [];
    };
    const closeList = () => {
      if (listType) html.push(`</${listType}>`);
      listType = null;
    };
    const closeTable = () => {
      if (inTable) html.push('</tbody></table></div>');
      inTable = false;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() === '$$') {
        flushParagraph(); closeList(); closeTable();
        if (!inMath) { inMath = true; math = []; }
        else { html.push(`<div class="math-block">\\[${mathSource(math.join('\n'))}\\]</div>`); inMath = false; }
        continue;
      }
      if (inMath) { math.push(line); continue; }
      if (line.startsWith('```')) {
        flushParagraph(); closeList(); closeTable();
        if (!inCode) { inCode = true; codeLang = line.slice(3).trim(); code = []; }
        else { html.push(`<pre><code class="language-${escapeHtml(codeLang)}">${escapeHtml(code.join('\n'))}</code></pre>`); inCode = false; }
        continue;
      }
      if (inCode) { code.push(line); continue; }
      if (/^\|.+\|$/.test(line) && i + 1 < lines.length && /^\|?\s*:?-+/.test(lines[i + 1])) {
        flushParagraph(); closeList(); closeTable();
        const headers = line.split('|').slice(1, -1);
        html.push('<div class="table-wrap"><table><thead><tr>' + headers.map(h => `<th>${inline(h.trim())}</th>`).join('') + '</tr></thead><tbody>');
        inTable = true; i++; continue;
      }
      if (inTable && /^\|.+\|$/.test(line)) {
        const cells = line.split('|').slice(1, -1);
        html.push('<tr>' + cells.map(cell => `<td>${inline(cell.trim())}</td>`).join('') + '</tr>');
        continue;
      } else if (inTable) closeTable();

      const heading = line.match(/^(#{1,4})\s+(.+)$/);
      if (heading) {
        flushParagraph(); closeList();
        const level = heading[1].length;
        const title = heading[2].replace(/\*\*/g, '');
        const id = slugify(title);
        html.push(
          `<h${level} id="${id}">${inline(title)}</h${level}>`
        );
        continue;
      }
      if (/^---+$/.test(line.trim())) { flushParagraph(); closeList(); html.push('<hr>'); continue; }
      if (/^>\s?/.test(line)) { flushParagraph(); closeList(); html.push(`<blockquote>${inline(line.replace(/^>\s?/, ''))}</blockquote>`); continue; }
      const item = line.match(/^\s*([-*]|\d+\.)\s+(.+)$/);
      if (item) {
        flushParagraph();
        const type = /\d/.test(item[1]) ? 'ol' : 'ul';
        if (listType !== type) { closeList(); html.push(`<${type}>`); listType = type; }
        html.push(`<li>${inline(item[2])}</li>`); continue;
      }
      if (!line.trim()) { flushParagraph(); closeList(); continue; }
      paragraph.push(line.trim());
    }
    flushParagraph(); closeList(); closeTable();
    if (inCode) html.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
    if (inMath) html.push(`<div class="math-block">\\[${mathSource(math.join('\n'))}\\]</div>`);
    return html.join('\n');
  }

  function buildTree(items) {
    const filtered = items.filter(doc => {
      const query = search.value.trim().toLowerCase();
      return !query || `${doc.title} ${doc.category} ${(doc.tags || []).join(' ')}`.toLowerCase().includes(query);
    });
    count.textContent = `${filtered.length} Document(s)`;
    const groups = filtered.reduce((result, doc) => {
      (result[doc.category] ||= []).push(doc);
      return result;
    }, {});
    tree.innerHTML = Object.keys(groups).sort().map(category => `
      <section class="category-group">
        <h2><span aria-hidden="true">▾</span>${escapeHtml(category)}</h2>
        <ul>${groups[category].map(doc => `<li><a href="?doc=${encodeURIComponent(doc.slug)}" data-slug="${escapeHtml(doc.slug)}">${escapeHtml(doc.title)}</a></li>`).join('')}</ul>
      </section>`).join('') || '<p class="empty-message">검색 결과가 없습니다.</p>';
    const current = new URLSearchParams(location.search).get('doc') || manifest[0]?.slug;
    tree.querySelector(`[data-slug="${CSS.escape(current || '')}"]`)?.classList.add('current');
  }

  function buildToc() {
    const headings = [...article.querySelectorAll('.article-content h2, .article-content h3, .article-content h4')];
    const counters = [0, 0, 0];
    const entries = headings.map(heading => {
      const depth = Number(heading.tagName.slice(1)) - 2;
      counters[depth] += 1;
      for (let i = depth + 1; i < counters.length; i++) counters[i] = 0;
      for (let i = 0; i < depth; i++) if (counters[i] === 0) counters[i] = 1;
      const number = counters.slice(0, depth + 1).join('.');
      const title = heading.textContent.replace(/#$/, '').trim();
      heading.id = `sec-${number}`;

      // 본문 제목 옆 # 링크도 번호 주소로 변경
      const headingAnchor = heading.querySelector('.heading-anchor');
      if (headingAnchor) {
        headingAnchor.setAttribute('href', `#${number}`);
      }
      const numberNode = document.createElement('span');
      numberNode.className = 'section-number';
      numberNode.setAttribute('aria-hidden', 'true');
      numberNode.textContent = number;
      heading.prepend(numberNode);
      return {heading, depth, number, title};
    });
    toc.innerHTML = entries.map(({heading, depth, number, title}) => `<a class="toc-level-${depth + 2}" href="#${heading.id}"><span>${number}</span>${escapeHtml(title)}</a>`).join('');
  }

  function scrollToCurrentSection(behavior = 'smooth') {
    const rawHash = location.hash.slice(1);
    if (!rawHash) {
      window.scrollTo({top: 0, behavior});
      return;
    }

    let id;
    try {
      id = decodeURIComponent(rawHash);
    } catch {
      id = rawHash;
    }

    const target = document.getElementById(id);
    if (target) {
      target.scrollIntoView({behavior, block: 'start'});
    } else {
      window.scrollTo({top: 0, behavior});
    }
  }

  function handleSectionLink(event) {
    const link = event.target.closest('a[href^="#"]');
    if (!link) return;

    const rawId = link.getAttribute('href').slice(1);
    let id;
    try {
      id = decodeURIComponent(rawId);
    } catch {
      id = rawId;
    }

    const target = document.getElementById(id);
    if (!target) return;

    event.preventDefault();

    const url = new URL(window.location.href);
    url.hash = id;
    history.replaceState(history.state, '', url);
    target.scrollIntoView({behavior: 'smooth', block: 'start'});
  }

  async function loadDoc(slug, updateHistory = false) {
    const doc = manifest.find(item => item.slug === slug) || manifest[0];
    if (!doc) return;
    try {
      const response = await fetch(`../content/${doc.file}`);
      if (!response.ok) throw new Error('문서를 찾을 수 없습니다.');
      const parsed = parseFrontMatter(await response.text());
      const tags = Array.isArray(parsed.meta.tags) ? parsed.meta.tags : doc.tags || [];
      article.innerHTML = `
        <nav class="wiki-breadcrumb" aria-label="현재 위치"><a href="./">Docs</a><span>/</span><span>${escapeHtml(doc.category)}</span></nav>
        <header class="article-header">
          <h1>${escapeHtml(parsed.meta.title || doc.title)}</h1>
          <p>${escapeHtml(parsed.meta.summary || doc.summary || '')}</p>
          <div class="article-meta"><time datetime="${escapeHtml(doc.date)}">${escapeHtml(doc.date.replaceAll('-', '. '))}</time><span>Sort: ${escapeHtml(doc.category)}</span></div>
          <div class="article-tags">${tags.map(tag => `<span>${escapeHtml(tag)}</span>`).join('')}</div>
        </header>
        <div class="article-content">${markdown(parsed.body)}</div>
        <footer class="article-footer"><p>This document is maintained in original Markdown format.</p><a href="../content/${encodeURI(doc.file)}">Raw Markdown</a></footer>`;
      document.title = `${doc.title} · Coldie's Webpage · Docs`;
      if (updateHistory) history.pushState({slug: doc.slug}, '', `?doc=${encodeURIComponent(doc.slug)}`);
      buildTree(manifest); buildToc();
      try {
        const MathJax = await ensureMathJax();
        await MathJax.typesetPromise([article]);
      } catch (error) {
        console.warn(error.message);
      }
      closeMobileSidebar();
      article.focus({preventScroll: true});
      requestAnimationFrame(() => scrollToCurrentSection('smooth'));
    } catch (error) {
      article.innerHTML = `<div class="error-state"><h1>문서를 열 수 없습니다.</h1><p>${escapeHtml(error.message)}</p></div>`;
    }
  }

  function openMobileSidebar() {
    sidebar.classList.add('open'); backdrop.hidden = false; sidebarToggle.setAttribute('aria-expanded', 'true');
  }
  function closeMobileSidebar() {
    sidebar.classList.remove('open'); backdrop.hidden = true; sidebarToggle.setAttribute('aria-expanded', 'false');
  }

  search.addEventListener('input', () => buildTree(manifest));
  toc.addEventListener('click', handleSectionLink);
  article.addEventListener('click', event => {
    if (event.target.closest('.heading-anchor')) handleSectionLink(event);
  });
  tree.addEventListener('click', event => {
    const link = event.target.closest('a[data-slug]');
    if (!link) return;
    event.preventDefault(); loadDoc(link.dataset.slug, true);
  });
  sidebarToggle.addEventListener('click', openMobileSidebar);
  closeSidebar.addEventListener('click', closeMobileSidebar);
  backdrop.addEventListener('click', closeMobileSidebar);
  addEventListener('popstate', () => loadDoc(new URLSearchParams(location.search).get('doc') || manifest[0]?.slug));

  Promise.all([
    fetch('../content/manifest.json').then(response => {
    if (!response.ok) throw new Error('문서 목록을 불러오지 못했습니다.');
    return response.json();
    }),
    fetch('../content/math-preamble.tex').then(response => response.ok ? response.text() : '').catch(() => '')
  ]).then(([data, preamble]) => {
    mathPreamble = usablePreamble(preamble);
    manifest = data.documents;
    buildTree(manifest);
    return loadDoc(new URLSearchParams(location.search).get('doc') || manifest[0]?.slug);
  }).catch(error => {
    article.innerHTML = `<div class="error-state"><h1>Docs를 시작할 수 없습니다.</h1><p>${escapeHtml(error.message)}</p></div>`;
  });
})();
