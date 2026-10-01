# coldie-lab.github.io/pages 배포 패키지

이 패키지의 `pages/` 폴더를 `coldie-lab.github.io` 저장소 루트에 그대로 추가하면 다음 주소에서 홈페이지가 열립니다.

```text
https://coldie-lab.github.io/pages/
```

저장소 구조:

```text
coldie-lab.github.io/
├── 기존 홈페이지 파일
└── pages/
    ├── index.html
    ├── about/
    ├── docs/
    ├── content/
    └── assets/
```

기존 GitHub Pages가 저장소의 기본 브랜치 `/ (root)`를 배포하고 있다면 별도 설정은 필요하지 않습니다. 기존 배포가 GitHub Actions를 사용한다면 해당 작업에서 `pages/` 폴더가 배포 산출물에 포함되는지 확인해야 합니다.

접속 주소:

- Home: `https://coldie-lab.github.io/pages/`
- About: `https://coldie-lab.github.io/pages/about/`
- Docs: `https://coldie-lab.github.io/pages/docs/`

## 수식 작성

공통 수식 명령은 `pages/content/math-preamble.tex`에서 관리합니다. 인라인 수식은 `$...$`, 블록 수식은 별도 줄의 `$$` 사이에 작성합니다.

```md
확률변수 $X \in \R$의 평균은 $\E[X]$입니다.

$$
\Var(X) = \E[(X - \E[X])^2]
$$
```

브라우저 기반 MathJax는 완전한 LaTeX 배포판이 아니므로 임의의 `\usepackage`를 설치할 수는 없습니다. 기본 파일에 선언된 `amsmath`, `amssymb`, `mathtools`와 `\newcommand`를 사용할 수 있습니다.
