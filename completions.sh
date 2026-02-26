#!/usr/bin/env bash
# Tab completion for tools.sh
#
# Installation:
#   bash: Add to ~/.bashrc:
#         source /path/to/tools/completions.sh
#
#   zsh:  Add to ~/.zshrc:
#         source /path/to/tools/completions.sh

# Capture the tools directory at source time
_TOOLS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd)"

_tools_list() {
    local tools_dir="$1"
    for dir in "$tools_dir"/*/; do
        [ -f "${dir}run.sh" ] && basename "$dir"
    done
}

if [ -n "${ZSH_VERSION:-}" ]; then
    _tools_zsh() {
        _arguments \
            '1: :->tool' \
            '*: :_files' && return
        local tools
        tools=($(_tools_list "$_TOOLS_DIR"))
        compadd "$@" -- "${tools[@]}"
    }
    compdef _tools_zsh tools tools.sh
else
    _tools_bash() {
        local cur="${COMP_WORDS[COMP_CWORD]}"
        if [ "$COMP_CWORD" -eq 1 ]; then
            local tools
            tools=$(_tools_list "$_TOOLS_DIR" | tr '\n' ' ')
            COMPREPLY=($(compgen -W "$tools" -- "$cur"))
        else
            COMPREPLY=($(compgen -f -- "$cur"))
        fi
    }
    complete -F _tools_bash tools tools.sh
fi
