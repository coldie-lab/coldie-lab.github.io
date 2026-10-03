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

  const escapeHtml = (value = '') =>
    value.replace(/[&<>'"]/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    })[char]);

  const slugify = value =>
    value
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .replace(/\s+/g, '-');

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
    if (window.MathJax?.typesetPromise) {
      return Promise.resolve(window.MathJax);
    }

    if (mathJaxPromise) {
      return mathJaxPromise;
    }

    window.MathJax = {
      loader: {
        load: ['[tex]/ams', '[tex]/newcommand', '[tex]/mathtools']
      },
      tex: {
        packages: {
          '[+]': ['ams', 'newcommand', 'mathtools']
        },
        inlineMath: [['\\(', '\\)']],
        displayMath: [['\\[', '\\]']]
      },
      options: {
        skipHtmlTags: [
          'script',
          'noscript',
          'style',
          'textarea',
          'pre',
          'code'
        ]
      }
    };

    mathJaxPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');

      script.src =
        'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js';
      script.async = true;
      script.onload = () => resolve(window.MathJax);
      script.onerror = () =>
        reject(new Error('수식 렌더러를 불러오지 못했습니다.'));

      document.head.append(script);
    });

    return mathJaxPromise;
  }

  function parseFrontMatter(source) {
    source = source.replace(/^<!-- raw-markdown -->\s*/, '');

    if (!source.startsWith('---\n')) {
      return {
        meta: {},
        body: source
      };
    }

    const end = source.indexOf('\n---\n', 4);

    if (end < 0) {
      return {
        meta: {},
        body: source
      };
    }

    const meta = {};

    source
      .slice(4, end)
      .split('\n')
      .forEach(line => {
        const split = line.indexOf(':');

        if (split < 0) {
          return;
        }

        const key = line.slice(0, split).trim();
        let value = line.slice(split + 1).trim();

        if (value.startsWith('[') && value.endsWith(']')) {
          value = value
            .slice(1, -1)
            .split(',')
            .map(item => item.trim());
        }

        meta[key] = value;
      });

    return {
      meta,
      body: source.slice(end + 5)
    };
  }

  function inline(text, renderFootnoteReference = null) {
    const expressions = [];
    const footnoteReferences = [];

    /*
     * 각주 참조를 Markdown의 다른 치환 작업에서 보호하기 위해
     * 임시 토큰으로 변경한다.
     */
    if (renderFootnoteReference) {
      text = text.replace(
        /\[\^([^\]]+)\]/g,
        (match, label) => {
          const rendered = renderFootnoteReference(
            label.trim(),
            match
          );

          if (rendered === match) {
            return match;
          }

          const token =
            `@@FOOTNOTE${footnoteReferences.length}@@`;

          footnoteReferences.push(rendered);

          return token;
        }
      );
    }

    /*
     * 인라인 수식을 임시 토큰으로 변경한다.
     */
    text = text.replace(
      /(^|[^\\])\$([^$\n]+)\$/g,
      (_, prefix, expression) => {
        const token = `@@MATH${expressions.length}@@`;

        expressions.push(expression);

        return prefix + token;
      }
    );

    let out = escapeHtml(text);

    /*
     * 너비를 지정한 이미지
     *
     * 예:
     * ![설명](/pages/content/image.jpg){width=30%}
     * ![설명](/pages/content/image.jpg){width=400px}
     */
    out = out.replace(
      /!\[([^\]]*)\]\(([^)\s]+)\)\{width=(\d+(?:px|%)?)\}/g,
      (_, alt, src, width) => {
        const normalizedWidth =
          width.endsWith('%') || width.endsWith('px')
            ? width
            : `${width}px`;

        return (
          `<img ` +
          `class="doc-image" ` +
          `src="${src}" ` +
          `alt="${alt}" ` +
          `loading="lazy" ` +
          `style="width: ${normalizedWidth};">`
        );
      }
    );

    /*
     * 일반 이미지
     */
    out = out.replace(
      /!\[([^\]]*)\]\(([^)\s]+)\)/g,
      '<img class="doc-image" src="$2" alt="$1" loading="lazy">'
    );

    /*
     * 표 안에서도 <br>을 사용할 수 있도록 처리한다.
     */
    out = out.replace(
      /&lt;br\s*\/?&gt;/gi,
      '<br>'
    );

    /*
     * 인라인 코드
     */
    out = out.replace(
      /`([^`]+)`/g,
      '<code>$1</code>'
    );

    /*
     * 굵게
     */
    out = out.replace(
      /\*\*([^*]+)\*\*/g,
      '<strong>$1</strong>'
    );

    /*
     * 기울임
     */
    out = out.replace(
      /\*([^*]+)\*/g,
      '<em>$1</em>'
    );

    /*
     * 외부 링크
     */
    out = out.replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>'
    );

    /*
     * 내부 및 상대 경로 링크
     */
    out = out.replace(
      /\[([^\]]+)\]\(([^\s)]+)\)/g,
      '<a href="$2">$1</a>'
    );

    /*
     * 인라인 수식 복원
     */
    expressions.forEach((expression, index) => {
      out = out.replace(
        `@@MATH${index}@@`,
        `<span class="math-inline">\\(${mathSource(expression)}\\)</span>`
      );
    });

    /*
     * 각주 참조 복원
     */
    footnoteReferences.forEach((reference, index) => {
      out = out.replace(
        `@@FOOTNOTE${index}@@`,
        reference
      );
    });

    return out;
  }

  function markdown(source) {
    const sourceLines = source
      .replace(/\r/g, '')
      .split('\n');

    const footnoteDefinitions = new Map();
    const lines = [];

    /*
     * 각주 정의를 본문에서 분리한다.
     *
     * 예:
     * [^source]: 각주 내용
     *
     * 정의 바로 다음에 들여쓴 행이 있으면
     * 같은 각주의 연속 내용으로 처리한다.
     */
    for (let i = 0; i < sourceLines.length; i++) {
      const definition = sourceLines[i].match(
        /^\[\^([^\]]+)\]:\s*(.*)$/
      );

      if (!definition) {
        lines.push(sourceLines[i]);
        continue;
      }

      const label = definition[1].trim();
      const definitionLines = [definition[2]];

      while (
        i + 1 < sourceLines.length &&
        /^(?: {2,}|\t)\S/.test(sourceLines[i + 1])
      ) {
        i++;
        definitionLines.push(sourceLines[i].trim());
      }

      /*
       * 같은 이름의 정의가 중복되면
       * 처음 작성된 정의를 사용한다.
       */
      if (!footnoteDefinitions.has(label)) {
        footnoteDefinitions.set(
          label,
          definitionLines.join(' ')
        );
      }
    }

    const html = [];

    /*
     * 각주 이름과 화면 번호를 연결한다.
     */
    const footnotesByLabel = new Map();

    /*
     * 본문에서 처음 등장한 순서대로 각주를 저장한다.
     */
    const footnotesInOrder = [];

    let paragraph = [];
    let listType = null;
    let inCode = false;
    let codeLang = '';
    let code = [];
    let inTable = false;
    let inMath = false;
    let math = [];

    /*
     * 본문의 [^name]을 각주 번호 링크로 변환한다.
     */
    const renderFootnoteReference = (
      label,
      original
    ) => {
      /*
       * 대응하는 정의가 없으면 원문을 그대로 표시한다.
       */
      if (!footnoteDefinitions.has(label)) {
        return original;
      }

      let footnote = footnotesByLabel.get(label);

      /*
       * 처음 등장한 각주에는 새 번호를 부여한다.
       */
      if (!footnote) {
        footnote = {
          label,
          number: footnotesInOrder.length + 1,
          referenceIds: []
        };

        footnotesByLabel.set(label, footnote);
        footnotesInOrder.push(footnote);
      }

      /*
       * 같은 각주를 여러 번 참조할 수 있도록
       * 각각의 참조 위치에 별도 ID를 부여한다.
       */
      const occurrence =
        footnote.referenceIds.length + 1;

      const referenceId =
        `fnref-${footnote.number}-${occurrence}`;

      footnote.referenceIds.push(referenceId);

      return (
        `<sup ` +
        `class="footnote-ref" ` +
        `id="${referenceId}">` +
        `<a ` +
        `href="#fn-${footnote.number}" ` +
        `aria-label="각주 ${footnote.number}">` +
        `${footnote.number}` +
        `</a>` +
        `</sup>`
      );
    };

    const renderInline = text =>
      inline(text, renderFootnoteReference);

    const flushParagraph = () => {
      if (paragraph.length) {
        html.push(
          `<p>${renderInline(paragraph.join(' '))}</p>`
        );
      }

      paragraph = [];
    };

    const closeList = () => {
      if (listType) {
        html.push(`</${listType}>`);
      }

      listType = null;
    };

    const closeTable = () => {
      if (inTable) {
        html.push('</tbody></table></div>');
      }

      inTable = false;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      /*
       * 블록 수식
       */
      if (line.trim() === '$$') {
        flushParagraph();
        closeList();
        closeTable();

        if (!inMath) {
          inMath = true;
          math = [];
        } else {
          html.push(
            `<div class="math-block">` +
            `\\[${mathSource(math.join('\n'))}\\]` +
            `</div>`
          );

          inMath = false;
        }

        continue;
      }

      if (inMath) {
        math.push(line);
        continue;
      }

      /*
       * 코드 블록
       */
      if (line.startsWith('```')) {
        flushParagraph();
        closeList();
        closeTable();

        if (!inCode) {
          inCode = true;
          codeLang = line.slice(3).trim();
          code = [];
        } else {
          html.push(
            `<pre>` +
            `<code class="language-${escapeHtml(codeLang)}">` +
            `${escapeHtml(code.join('\n'))}` +
            `</code>` +
            `</pre>`
          );

          inCode = false;
        }

        continue;
      }

      if (inCode) {
        code.push(line);
        continue;
      }

      /*
       * 표 시작
       */
      if (
        /^\|.+\|$/.test(line) &&
        i + 1 < lines.length &&
        /^\|?\s*:?-+/.test(lines[i + 1])
      ) {
        flushParagraph();
        closeList();
        closeTable();

        const headers = line
          .split('|')
          .slice(1, -1);

        html.push(
          '<div class="table-wrap">' +
          '<table>' +
          '<thead>' +
          '<tr>' +
          headers
            .map(header =>
              `<th>${renderInline(header.trim())}</th>`
            )
            .join('') +
          '</tr>' +
          '</thead>' +
          '<tbody>'
        );

        inTable = true;
        i++;

        continue;
      }

      /*
       * 표의 데이터 행
       */
      if (
        inTable &&
        /^\|.+\|$/.test(line)
      ) {
        const cells = line
          .split('|')
          .slice(1, -1);

        html.push(
          '<tr>' +
          cells
            .map(cell =>
              `<td>${renderInline(cell.trim())}</td>`
            )
            .join('') +
          '</tr>'
        );

        continue;
      } else if (inTable) {
        closeTable();
      }

      /*
       * 제목
       */
      const heading = line.match(
        /^(#{1,4})\s+(.+)$/
      );

      if (heading) {
        flushParagraph();
        closeList();

        const level = heading[1].length;
        const title = heading[2].replace(/\*\*/g, '');
        const id = slugify(title);

        html.push(
          `<h${level} id="${id}">` +
          `${renderInline(title)}` +
          `</h${level}>`
        );

        continue;
      }

      /*
       * 가로선
       */
      if (/^---+$/.test(line.trim())) {
        flushParagraph();
        closeList();
        html.push('<hr>');
        continue;
      }

      /*
       * 목록 항목 안의 중첩 인용문
       */
      const nestedQuote = line.match(
        /^\s{2,}>\s?(.*)$/
      );

      if (
        nestedQuote &&
        listType &&
        html.length
      ) {
        const quoteLines = [nestedQuote[1]];

        while (
          i + 1 < lines.length &&
          /^\s{2,}>\s?/.test(lines[i + 1])
        ) {
          i++;

          quoteLines.push(
            lines[i].replace(
              /^\s{2,}>\s?/,
              ''
            )
          );
        }

        const lastIndex = html.length - 1;
        const lastItem = html[lastIndex];

        if (lastItem.endsWith('</li>')) {
          html[lastIndex] =
            lastItem.slice(0, -5) +
            `<blockquote>` +
            `${renderInline(quoteLines.join(' '))}` +
            `</blockquote>` +
            `</li>`;
        }

        continue;
      }

      /*
       * 일반 인용문
       */
      if (/^>\s?/.test(line)) {
        flushParagraph();
        closeList();

        html.push(
          `<blockquote>` +
          `${renderInline(line.replace(/^>\s?/, ''))}` +
          `</blockquote>`
        );

        continue;
      }

      /*
       * 순서 없는 목록 및 순서 있는 목록
       */
      const item = line.match(
        /^\s*([-*]|\d+\.)\s+(.+)$/
      );

      if (item) {
        flushParagraph();

        const type =
          /\d/.test(item[1])
            ? 'ol'
            : 'ul';

        if (listType !== type) {
          closeList();
          html.push(`<${type}>`);
          listType = type;
        }

        html.push(
          `<li>${renderInline(item[2])}</li>`
        );

        continue;
      }

      /*
       * 빈 줄
       */
      if (!line.trim()) {
        flushParagraph();
        closeList();
        continue;
      }

      paragraph.push(line.trim());
    }

    flushParagraph();
    closeList();
    closeTable();

    /*
     * 닫히지 않은 코드 블록 처리
     */
    if (inCode) {
      html.push(
        `<pre>` +
        `<code>${escapeHtml(code.join('\n'))}</code>` +
        `</pre>`
      );
    }

    /*
     * 닫히지 않은 블록 수식 처리
     */
    if (inMath) {
      html.push(
        `<div class="math-block">` +
        `\\[${mathSource(math.join('\n'))}\\]` +
        `</div>`
      );
    }

    /*
     * 문서 하단에 각주 목록을 생성한다.
     */
    if (footnotesInOrder.length) {
      const items = footnotesInOrder
        .map(footnote => {
          /*
           * 같은 각주가 여러 번 참조되면
           * ↩a, ↩b, ↩c 형식으로 복귀 링크를 만든다.
           */
          const backlinks = footnote.referenceIds
            .map((referenceId, index) => {
              const suffix =
                footnote.referenceIds.length > 1
                  ? String.fromCharCode(97 + index)
                  : '';

              return (
                `<a ` +
                `class="footnote-backref" ` +
                `href="#${referenceId}" ` +
                `aria-label="각주 ${footnote.number}의 ` +
                `${index + 1}번째 참조로 돌아가기">` +
                `↩${suffix}` +
                `</a>`
              );
            })
            .join(' ');

          const definition =
            footnoteDefinitions.get(footnote.label);

          return (
            `<li id="fn-${footnote.number}">` +
            `<span class="footnote-text">` +
            `${inline(definition)}` +
            `</span> ` +
            `<span class="footnote-backrefs">` +
            `${backlinks}` +
            `</span>` +
            `</li>`
          );
        })
        .join('\n');

      html.push(
        `<section class="footnotes" aria-label="각주">` +
        `<hr>` +
        `<ol>` +
        `${items}` +
        `</ol>` +
        `</section>`
      );
    }

    return html.join('\n');
  }

  function buildTree(items) {
    const filtered = items.filter(doc => {
      const query =
        search.value.trim().toLowerCase();

      return (
        !query ||
        `${doc.title} ${doc.category} ${(doc.tags || []).join(' ')}`
          .toLowerCase()
          .includes(query)
      );
    });

    count.textContent =
      `${filtered.length} Document(s)`;

    const groups = filtered.reduce(
      (result, doc) => {
        (result[doc.category] ||= []).push(doc);
        return result;
      },
      {}
    );

    tree.innerHTML =
      Object.keys(groups)
        .sort()
        .map(category => `
          <section class="category-group">
            <h2>
              <span aria-hidden="true">▾</span>
              ${escapeHtml(category)}
            </h2>
            <ul>
              ${groups[category]
                .map(doc => `
                  <li>
                    <a
                      href="?doc=${encodeURIComponent(doc.slug)}"
                      data-slug="${escapeHtml(doc.slug)}"
                    >
                      ${escapeHtml(doc.title)}
                    </a>
                  </li>
                `)
                .join('')}
            </ul>
          </section>
        `)
        .join('') ||
      '<p class="empty-message">검색 결과가 없습니다.</p>';

    const current =
      new URLSearchParams(location.search).get('doc') ||
      manifest[0]?.slug;

    tree
      .querySelector(
        `[data-slug="${CSS.escape(current || '')}"]`
      )
      ?.classList.add('current');
  }

  function buildToc() {
    const headings = [
      ...article.querySelectorAll(
        '.article-content h2, ' +
        '.article-content h3, ' +
        '.article-content h4'
      )
    ];

    const counters = [0, 0, 0];

    const entries = headings.map(heading => {
      const depth =
        Number(heading.tagName.slice(1)) - 2;

      counters[depth] += 1;

      for (
        let i = depth + 1;
        i < counters.length;
        i++
      ) {
        counters[i] = 0;
      }

      for (let i = 0; i < depth; i++) {
        if (counters[i] === 0) {
          counters[i] = 1;
        }
      }

      const number = counters
        .slice(0, depth + 1)
        .join('.');

      const title = heading.textContent
        .replace(/#$/, '')
        .trim();

      heading.id = `sec-${number}`;

      const headingAnchor =
        heading.querySelector('.heading-anchor');

      if (headingAnchor) {
        headingAnchor.setAttribute(
          'href',
          `#${number}`
        );
      }

      const numberNode =
        document.createElement('span');

      numberNode.className = 'section-number';
      numberNode.setAttribute(
        'aria-hidden',
        'true'
      );
      numberNode.textContent = number;

      heading.prepend(numberNode);

      return {
        heading,
        depth,
        number,
        title
      };
    });

    toc.innerHTML = entries
      .map(({
        heading,
        depth,
        number,
        title
      }) => (
        `<a ` +
        `class="toc-level-${depth + 2}" ` +
        `href="#${heading.id}">` +
        `<span>${number}</span>` +
        `${escapeHtml(title)}` +
        `</a>`
      ))
      .join('');
  }

  function scrollToCurrentSection(
    behavior = 'smooth'
  ) {
    const rawHash = location.hash.slice(1);

    if (!rawHash) {
      window.scrollTo({
        top: 0,
        behavior
      });

      return;
    }

    let id;

    try {
      id = decodeURIComponent(rawHash);
    } catch {
      id = rawHash;
    }

    const target =
      document.getElementById(id);

    if (target) {
      target.scrollIntoView({
        behavior,
        block: 'start'
      });
    } else {
      window.scrollTo({
        top: 0,
        behavior
      });
    }
  }

  function handleSectionLink(event) {
    const link = event.target.closest(
      'a[href^="#"]'
    );

    if (!link) {
      return;
    }

    const rawId =
      link.getAttribute('href').slice(1);

    let id;

    try {
      id = decodeURIComponent(rawId);
    } catch {
      id = rawId;
    }

    const target =
      document.getElementById(id);

    if (!target) {
      return;
    }

    event.preventDefault();

    const url =
      new URL(window.location.href);

    url.hash = id;

    history.replaceState(
      history.state,
      '',
      url
    );

    target.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  }

  async function loadDoc(
    slug,
    updateHistory = false
  ) {
    const doc =
      manifest.find(item => item.slug === slug) ||
      manifest[0];

    if (!doc) {
      return;
    }

    try {
      const response = await fetch(
        `../content/${doc.file}`
      );

      if (!response.ok) {
        throw new Error(
          '문서를 찾을 수 없습니다.'
        );
      }

      const parsed = parseFrontMatter(
        await response.text()
      );

      const tags =
        Array.isArray(parsed.meta.tags)
          ? parsed.meta.tags
          : doc.tags || [];

      article.innerHTML = `
        <nav
          class="wiki-breadcrumb"
          aria-label="현재 위치"
        >
          <a href="./">Docs</a>
          <span>/</span>
          <span>${escapeHtml(doc.category)}</span>
        </nav>

        <header class="article-header">
          <h1>
            ${escapeHtml(
              parsed.meta.title || doc.title
            )}
          </h1>

          <p>
            ${escapeHtml(
              parsed.meta.summary ||
              doc.summary ||
              ''
            )}
          </p>

          <div class="article-meta">
            <time datetime="${escapeHtml(doc.date)}">
              ${escapeHtml(
                doc.date.replaceAll('-', '. ')
              )}
            </time>

            <span>
              Sort: ${escapeHtml(doc.category)}
            </span>
          </div>

          <div class="article-tags">
            ${tags
              .map(tag =>
                `<span>${escapeHtml(tag)}</span>`
              )
              .join('')}
          </div>
        </header>

        <div class="article-content">
          ${markdown(parsed.body)}
        </div>

        <footer class="article-footer">
          <p>
            This document is maintained in
            original Markdown format.
          </p>

          <a href="../content/${encodeURI(doc.file)}">
            Raw Markdown
          </a>
        </footer>
      `;

      document.title =
        `${doc.title} · Coldie's Webpage · Docs`;

      if (updateHistory) {
        history.pushState(
          {slug: doc.slug},
          '',
          `?doc=${encodeURIComponent(doc.slug)}`
        );
      }

      buildTree(manifest);
      buildToc();

      try {
        const MathJax = await ensureMathJax();

        await MathJax.typesetPromise([
          article
        ]);
      } catch (error) {
        console.warn(error.message);
      }

      closeMobileSidebar();

      article.focus({
        preventScroll: true
      });

      requestAnimationFrame(() =>
        scrollToCurrentSection('smooth')
      );
    } catch (error) {
      article.innerHTML = `
        <div class="error-state">
          <h1>문서를 열 수 없습니다.</h1>
          <p>${escapeHtml(error.message)}</p>
        </div>
      `;
    }
  }

  function openMobileSidebar() {
    sidebar.classList.add('open');
    backdrop.hidden = false;

    sidebarToggle.setAttribute(
      'aria-expanded',
      'true'
    );
  }

  function closeMobileSidebar() {
    sidebar.classList.remove('open');
    backdrop.hidden = true;

    sidebarToggle.setAttribute(
      'aria-expanded',
      'false'
    );
  }

  search.addEventListener(
    'input',
    () => buildTree(manifest)
  );

  toc.addEventListener(
    'click',
    handleSectionLink
  );

  /*
   * 제목 링크와 각주 링크를 처리한다.
   */
  article.addEventListener(
    'click',
    event => {
      if (
        event.target.closest('a[href^="#"]')
      ) {
        handleSectionLink(event);
      }
    }
  );

  tree.addEventListener(
    'click',
    event => {
      const link = event.target.closest(
        'a[data-slug]'
      );

      if (!link) {
        return;
      }

      event.preventDefault();

      loadDoc(
        link.dataset.slug,
        true
      );
    }
  );

  sidebarToggle.addEventListener(
    'click',
    openMobileSidebar
  );

  closeSidebar.addEventListener(
    'click',
    closeMobileSidebar
  );

  backdrop.addEventListener(
    'click',
    closeMobileSidebar
  );

  addEventListener(
    'popstate',
    () => {
      const slug =
        new URLSearchParams(
          location.search
        ).get('doc') ||
        manifest[0]?.slug;

      loadDoc(slug);
    }
  );

  Promise.all([
    fetch('../content/manifest.json')
      .then(response => {
        if (!response.ok) {
          throw new Error(
            '문서 목록을 불러오지 못했습니다.'
          );
        }

        return response.json();
      }),

    fetch('../content/math-preamble.tex')
      .then(response =>
        response.ok
          ? response.text()
          : ''
      )
      .catch(() => '')
  ])
    .then(([data, preamble]) => {
      mathPreamble =
        usablePreamble(preamble);

      manifest = data.documents;

      buildTree(manifest);

      const slug =
        new URLSearchParams(
          location.search
        ).get('doc') ||
        manifest[0]?.slug;

      return loadDoc(slug);
    })
    .catch(error => {
      article.innerHTML = `
        <div class="error-state">
          <h1>Docs를 시작할 수 없습니다.</h1>
          <p>${escapeHtml(error.message)}</p>
        </div>
      `;
    });
})();
