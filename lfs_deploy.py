import re
import shutil
import subprocess
from pathlib import Path
from typing import List, Optional

import streamlit as st

# =================== DEFAULTS (pré-carregados) ===================
DEFAULT_REMOTE = "https://github.com/EduLeg0811/Cons.AI.git"
DEFAULT_BRANCH = "main"
DEFAULT_SCAN_SUBDIR = "backend/faiss_index"
DEFAULT_COMMIT_MSG = "Setup Git / Push (com ou sem LFS)"
DEFAULT_INCLUDE_PATTERNS = "*.faiss,backend/faiss_index.zip"  # usado no migrate
DEFAULT_ADD_ALL = True
DEFAULT_FORCE_WITH_LEASE = False
DEFAULT_DO_MIGRATE = False
# =================================================================

# -------------------- utilitários de shell -------------------- #
def run(cmd, cwd: Optional[Path] = None, check=True):
    """Executa e retorna (rc, stdout, stderr)."""
    shell = isinstance(cmd, str)
    try:
        p = subprocess.run(
            cmd, cwd=str(cwd) if cwd else None, check=check, text=True, shell=shell,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE
        )
        return p.returncode, p.stdout.strip(), p.stderr.strip()
    except subprocess.CalledProcessError as e:
        return e.returncode, (e.stdout or "").strip(), (e.stderr or "").strip()

def assert_tool(tool, help_msg):
    rc, _, _ = run([tool, "--version"], check=False)
    if rc != 0:
        st.error(f"Não encontrei `{tool}` no PATH. {help_msg}")
        st.stop()

# -------------------- git helpers -------------------- #
def in_git_repo(path: Path) -> bool:
    rc, out, _ = run(["git", "rev-parse", "--is-inside-work-tree"], cwd=path, check=False)
    return rc == 0 and (out or "").strip().lower() == "true"

def find_repo_root(start: Path) -> Optional[Path]:
    cur = start.resolve()
    for _ in range(25):
        if (cur / ".git").exists():
            return cur
        if cur.parent == cur:
            return None
        cur = cur.parent
    return None

def nuke_git_folder(repo_root: Path):
    git_path = repo_root / ".git"
    if git_path.exists():
        shutil.rmtree(git_path)

def init_or_use_repo(repo_root: Path, branch: str, mode_repo: str, log_append):
    if mode_repo == "Criar NOVO Git (apagar .git atual)":
        log_append("⚠️ Apagando pasta .git atual (histórico será perdido)…")
        nuke_git_folder(repo_root)
    if not in_git_repo(repo_root):
        log_append("[git] Repositório não detectado — executando `git init`…")
        rc, out, err = run(["git", "init"], cwd=repo_root, check=False)
        if rc != 0:
            raise RuntimeError(f"git init falhou:\n{out}\n{err}")
    log_append(f"[git] Selecionando/garantindo branch `{branch}`…")
    run(["git", "checkout", "-B", branch], cwd=repo_root, check=False)

def ensure_lfs(path: Path, log_append):
    log_append("[lfs] Ativando Git LFS (`git lfs install`)…")
    rc, out, err = run(["git", "lfs", "install"], cwd=path, check=False)
    if rc != 0:
        raise RuntimeError(f"git lfs install falhou:\n{out}\n{err}")

def to_repo_relative_posix(file_abs: Path, repo_root: Path) -> str:
    file_abs = file_abs.resolve()
    repo_root = repo_root.resolve()
    try:
        rel = file_abs.relative_to(repo_root)
    except ValueError:
        return ""
    return rel.as_posix()

def track_lfs_and_add(repo_root: Path, files_abs: List[Path], add_all: bool, log_append):
    rels = []
    for f in files_abs:
        if not f.exists():
            raise FileNotFoundError(f"Arquivo não encontrado: {f}")
        rel = to_repo_relative_posix(f, repo_root)
        if not rel:
            raise RuntimeError(f"O arquivo '{f}' não está dentro do repositório '{repo_root}'.")
        rels.append(rel)

    log_append("[lfs] Rastreando arquivos com LFS (literal, --filename)…")
    for rel in rels:
        log_append(f"      track → {rel}")
        rc, out, err = run(["git", "lfs", "track", "--filename", rel], cwd=repo_root, check=False)
        if rc != 0:
            raise RuntimeError(f"Falha ao rastrear '{rel}' com LFS:\n{out}\n{err}")

    # garante versionamento do .gitattributes
    run(["git", "add", ".gitattributes"], cwd=repo_root, check=False)

    log_append("[git] Forçando inclusão dos arquivos grandes (git add -f)…")
    for rel in rels:
        log_append(f"      add -f → {rel}")
        rc, out, err = run(["git", "add", "-f", rel], cwd=repo_root, check=False)
        if rc != 0:
            raise RuntimeError(f"Falha ao adicionar '{rel}':\n{out}\n{err}")

    if add_all:
        log_append("[git] Adicionando demais arquivos do projeto (git add .)…")
        run(["git", "add", "."], cwd=repo_root, check=False)

def add_all_if_requested(repo_root: Path, add_all: bool, log_append):
    if add_all:
        log_append("[git] Adicionando arquivos do projeto (git add .)…")
        run(["git", "add", "."], cwd=repo_root, check=False)

def make_commit(repo_root: Path, message: str, log_append):
    log_append("[git] Commit…")
    rc, out, err = run(["git", "commit", "-m", message], cwd=repo_root, check=False)
    if rc != 0:
        txt = (out + "\n" + err).lower()
        if "nothing to commit" in txt:
            log_append("      (Nada a commitar — possivelmente já estava tudo commitado.)")
        else:
            raise RuntimeError(f"Falha no commit:\n{out}\n{err}")

def configure_remote(repo_root: Path, remote_url: str, log_append):
    log_append(f"[git] Configurando remoto origin → {remote_url}")
    rc, out, _ = run(["git", "remote"], cwd=repo_root, check=False)
    remotes = (out or "").split()
    if "origin" in remotes:
        run(["git", "remote", "set-url", "origin", remote_url], cwd=repo_root, check=False)
    else:
        rc, out, err = run(["git", "remote", "add", "origin", remote_url], cwd=repo_root, check=False)
        if rc != 0:
            raise RuntimeError(f"Falha ao adicionar remoto origin:\n{out}\n{err}")

def migrate_history(repo_root: Path, include_patterns: str, ref: str, log_append):
    include_patterns = include_patterns.strip()
    log_append(f"[lfs] Migrando histórico para LFS (git lfs migrate import)…")
    log_append(f"      --include = {include_patterns}")
    log_append(f"      --include-ref = refs/heads/{ref}")
    cmd = [
        "git", "lfs", "migrate", "import",
        f"--include={include_patterns}",
        f"--include-ref=refs/heads/{ref}"
    ]
    rc, out, err = run(cmd, cwd=repo_root, check=False)
    if rc != 0:
        raise RuntimeError(f"git lfs migrate import falhou:\n{out}\n{err}")
    if out:
        log_append("------ migrate (stdout) ------")
        log_append(out)
    if err:
        log_append("------ migrate (stderr) ------")
        log_append(err)

def push_with_progress(repo_root: Path, branch: str, force_with_lease: bool, log_append):
    log_append("[git] Push para o remoto… (isso pode demorar)")
    cmd = ["git", "push", "-u", "origin", branch]
    if force_with_lease:
        cmd = ["git", "push", "--force-with-lease", "-u", "origin", branch]

    progress = st.progress(0, text="Iniciando push…")
    placeholder = st.empty()

    proc = subprocess.Popen(
        cmd, cwd=str(repo_root), text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE
    )

    percent = 0
    pattern_list = [
        re.compile(r"Uploading LFS objects:\s+(\d+)%"),
        re.compile(r"Writing objects:\s+(\d+)%"),
        re.compile(r"Compressing objects:\s+(\d+)%"),
        re.compile(r"Resolving deltas:\s+(\d+)%"),
    ]

    def update_from_line(line: str) -> Optional[int]:
        for pat in pattern_list:
            m = pat.search(line)
            if m:
                try:
                    return int(m.group(1))
                except Exception:
                    return None
        return None

    # stream
    while True:
        line_out = proc.stdout.readline() if proc.stdout else ""
        line_err = proc.stderr.readline() if proc.stderr else ""

        if line_out:
            log_append(line_out.rstrip())
            p = update_from_line(line_out)
            if p is not None:
                percent = max(percent, p)
                progress.progress(min(percent, 100), text=f"Push em andamento… {percent}%")

        if line_err:
            log_append(line_err.rstrip())
            p = update_from_line(line_err)
            if p is not None:
                percent = max(percent, p)
                progress.progress(min(percent, 100), text=f"Push em andamento… {percent}%")

        if proc.poll() is not None:
            rem_out = proc.stdout.read() if proc.stdout else ""
            rem_err = proc.stderr.read() if proc.stderr else ""
            if rem_out:
                for ln in rem_out.splitlines():
                    log_append(ln)
            if rem_err:
                for ln in rem_err.splitlines():
                    log_append(ln)
            break

    rc = proc.returncode
    if rc == 0:
        progress.progress(100, text="Push concluído ✓")
    else:
        progress.progress(percent, text=f"Push falhou ({percent}%). Verifique os logs.")
        raise RuntimeError("git push retornou código != 0 (falha).")

def list_lfs_files(repo_root: Path) -> str:
    rc, out, _ = run(["git", "lfs", "ls-files"], cwd=repo_root, check=False)
    return out or "(nenhum arquivo sob LFS)"

def scan_targets(repo_root: Path, scan_subdir: str) -> List[Path]:
    base = repo_root / scan_subdir if scan_subdir else repo_root
    files = []
    if base.exists():
        files = list(base.rglob("*.faiss"))
    if not files and scan_subdir:
        files = list(repo_root.rglob("*.faiss"))
    return files

# =================== UI =================== #
st.set_page_config(page_title="Git LFS — Config & Logs", page_icon="🧰", layout="wide")
st.title("🧰 Git Helper — Repo + LFS (com progresso)")

# BLOCO INICIAL EM DESTAQUE (suas duas escolhas)
st.markdown("## ⚙️ Escolhas iniciais (obrigatórias)")
mode_repo = st.radio(
    "Modo do repositório:",
    ["Usar Git EXISTENTE", "Criar NOVO Git (apagar .git atual)"],
    index=0,
    help="ATENÇÃO: ao escolher 'Criar NOVO', a pasta .git será removida e o histórico será perdido."
)
push_kind = st.radio(
    "Tipo de push:",
    ["Com LFS (arquivos grandes)", "Push normal (sem LFS)"],
    index=0,
    help="Escolha 'Com LFS' se houver arquivos grandes (>100MB) para evitar bloqueio do GitHub."
)

with st.sidebar:
    st.subheader("Configurações (pré-carregadas)")
    remote_url = st.text_input("Remote (origin)", value=DEFAULT_REMOTE)
    branch = st.text_input("Branch", value=DEFAULT_BRANCH)
    scan_subdir = st.text_input("Subpasta p/ varrer *.faiss", value=DEFAULT_SCAN_SUBDIR)
    commit_msg = st.text_input("Mensagem do commit", value=DEFAULT_COMMIT_MSG)
    include_patterns = st.text_input("Padrões p/ migrate (--include)", value=DEFAULT_INCLUDE_PATTERNS)
    add_all = st.checkbox("git add . (adicionar o resto do projeto)", value=DEFAULT_ADD_ALL)
    do_migrate = st.checkbox("Migrar histórico com git lfs migrate import", value=DEFAULT_DO_MIGRATE, help="Reescreve o histórico para mover blobs existentes ao LFS.")
    force_with_lease = st.checkbox("Forçar push com --force-with-lease", value=DEFAULT_FORCE_WITH_LEASE, help="Recomendado quando fizer migrate.")

# área de logs
st.subheader("Logs")
log_box = st.empty()
logs: List[str] = []

def log_append(msg: str):
    logs.append(msg)
    if len(logs) > 1500:
        del logs[: len(logs) - 1500]
    log_box.code("\n".join(logs), language="bash")

# detectar raiz do repo automaticamente (subindo a partir do cwd)
cwd = Path.cwd()
repo_root = find_repo_root(cwd) or cwd
st.info(f"Repositório detectado/base: `{repo_root}` "
        f"(se não houver .git, será inicializado aqui; modo selecionado: {mode_repo})")

if st.button("🚀 Executar"):
    # pré-checagens
    assert_tool("git", "Instale Git e reinicie este app.")
    if push_kind == "Com LFS (arquivos grandes)":
        rc, _, _ = run(["git", "lfs", "version"], check=False)
        if rc != 0:
            st.error("Git LFS não encontrado. Instale o Git LFS (no Windows vem com o Git atual).")
            st.stop()
    if not remote_url.strip():
        st.error("Informe a URL do remoto (origin) na sidebar.")
        st.stop()

    try:
        with st.status("Processando…", expanded=True) as status:
            # 1) preparar repo (e apagar .git se for o caso)
            log_append("[init] Preparando repositório…")
            init_or_use_repo(repo_root, branch, mode_repo, log_append)

            # 2) fluxo COM LFS
            if push_kind == "Com LFS (arquivos grandes)":
                log_append("[lfs] Ativando LFS…")
                ensure_lfs(repo_root, log_append)

                log_append(f"[scan] Buscando *.faiss em `{scan_subdir or '(repo inteiro)'}`…")
                targets = scan_targets(repo_root, scan_subdir.strip())
                if not targets:
                    raise RuntimeError("Nenhum arquivo .faiss encontrado.")
                for p in targets:
                    log_append(f"      encontrado: {p}")

                log_append("[lfs] Track & add…")
                track_lfs_and_add(repo_root, targets, add_all, log_append)

                if do_migrate:
                    log_append("[migrate] Reescrevendo histórico para mover arquivos grandes ao LFS…")
                    migrate_history(repo_root, include_patterns, branch, log_append)

                log_append("[git] Commit…")
                make_commit(repo_root, commit_msg, log_append)

            # 3) fluxo SEM LFS
            else:
                log_append("[git] (Sem LFS) Adicionando arquivos…")
                add_all_if_requested(repo_root, add_all, log_append)
                log_append("[git] Commit…")
                make_commit(repo_root, commit_msg, log_append)

            # 4) remoto e push
            log_append("[git] Configurando remoto…")
            configure_remote(repo_root, remote_url.strip(), log_append)

            log_append("[git] Push…")
            push_with_progress(repo_root, branch, (force_with_lease or do_migrate), log_append)

            lfs_list = list_lfs_files(repo_root) if push_kind == "Com LFS (arquivos grandes)" else "(não aplicável)"
            status.update(label="Concluído ✓", state="complete")

        st.success("Processo finalizado sem erros.")
        if push_kind == "Com LFS (arquivos grandes)":
            st.subheader("Arquivos sob LFS")
            st.code(lfs_list, language="bash")

    except Exception as e:
        st.error(f"❌ Erro: {e}")
        log_append(f"[erro] {e}")
