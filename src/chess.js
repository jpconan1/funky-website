import { Chess } from 'chess.js';
import { getSetting, setSetting, subscribeToSetting } from './supabase.js';
import { isAdminSession, requireAdmin } from './admin-auth.js';

// Importing piece images as ES modules lets Vite content-hash them,
// so updated sprites always bust the browser cache automatically.
import imgPawnWhite from './assets/chess/pawn-white.png';
import imgPawnBlack from './assets/chess/pawn-black.png';
import imgRookWhite from './assets/chess/rook-white.png';
import imgRookBlack from './assets/chess/rook-black.png';
import imgKnightWhite from './assets/chess/knight-white.png';
import imgKnightBlack from './assets/chess/knight-black.png';
import imgBishopWhite from './assets/chess/bishop-white.png';
import imgBishopBlack from './assets/chess/bishop-black.png';
import imgQueenWhite from './assets/chess/queen-white.png';
import imgQueenBlack from './assets/chess/queen-black.png';
import imgKingWhite from './assets/chess/king-white.png';
import imgKingBlack from './assets/chess/king-black.png';

const PIECE_IMAGES = {
    wp: imgPawnWhite, bp: imgPawnBlack,
    wr: imgRookWhite, br: imgRookBlack,
    wn: imgKnightWhite, bn: imgKnightBlack,
    wb: imgBishopWhite, bb: imgBishopBlack,
    wq: imgQueenWhite, bq: imgQueenBlack,
    wk: imgKingWhite, bk: imgKingBlack,
};

/**
 * Chess App for JP-OS
 * Admin vs The World
 */
export class ChessApp {
    constructor(wm, onMessageUpdate) {
        this.wm = wm;
        this.onMessageUpdate = onMessageUpdate;
        this.game = new Chess();
        this.isAdmin = isAdminSession();
        this.currentSubscription = null;
        this.boardElement = null;
        this.statusElement = null;
        this.selectedSquare = null;
        this.gameData = null;
        // Move history browser state
        this.historyBrowseIndex = null; // null = live, number = viewing past move
        this.historyGame = null;        // Chess instance used purely for replay
    }

    async open() {
        // Initial fetch — gracefully fall back to default state if DB isn't set up yet
        try {
            const setting = await getSetting('chess_game');
            this.gameData = setting ? setting.value : this.createInitialState();
            if (typeof this.gameData === 'string') this.gameData = JSON.parse(this.gameData);
        } catch (err) {
            console.warn('[Chess] Could not load game state from DB (table may not exist yet). Starting fresh.', err);
            this.gameData = this.createInitialState();
        }

        this.game.load(this.gameData.fen);
        // Replay saved moves to restore history array inside chess.js
        this._replayMoves(this.gameData.moves || []);

        const content = this.renderUI();
        this.window = this.wm.createWindow("Chess VS Admin", content);

        // Size the window to fit board + side history panel
        this.window.element.style.width = '680px';
        this.window.element.style.height = '530px';

        // Remove default window-content padding so the chess container fills it
        const contentEl = this.window.element.querySelector('.window-content');
        if (contentEl) {
            contentEl.style.padding = '0';
            contentEl.style.overflow = 'hidden';
        }

        this.boardElement = this.window.element.querySelector('.chess-board');
        this.statusElement = this.window.element.querySelector('.chess-status-text');

        this.updateBoard();
        this.updateDesktopIcon();
        this.setupSubscriptions();
        this.setupEventListeners();
        this.updateMoveHistory();

        // Auto-select the most recent move so it's highlighted on open
        const moves = this.gameData.moves || [];
        if (moves.length > 0) {
            this._browseToMove(moves.length - 1);
        }
    }

    createInitialState() {
        return {
            fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            turn: 'white',
            winner: null,
            adminPlayAs: 'white', // The first game admin plays as white
            moves: [],             // Full SAN move list for history panel
            stats: {
                admin_wins: 0,
                user_wins: 0
            }
        };
    }

    /**
     * Replay a list of SAN moves from the starting position so that
     * chess.js internal history is populated (used after loading from FEN).
     */
    _replayMoves(sanMoves) {
        // We don't touch this.game — it's already at the right FEN.
        // We just ensure gameData.moves is always the source-of-truth list.
        // (chess.js history() is unreliable after load(); we keep our own array.)
    }

    renderUI() {
        const turnLabel = this.isMyTurn() ? "YOUR MOVE" : "";
        const turnClass = this.isMyTurn() ? "chess-status-your-move" : "chess-status-hidden";
        const viewerRole = this.isAdmin ? "Admin" : "User";
        const opponentRole = this.isAdmin ? "User" : "Admin";

        return `
            <div class="chess-container">
                <div class="chess-info">
                    <div class="chess-status-left">
                        <span class="chess-status-badge ${turnClass}">${turnLabel}</span>
                    </div>
                    <div class="chess-status-right">
                         <span class="chess-status-text">Turn: ${this.getTurnLabel(this.game.turn())}</span>
                    </div>
                </div>

                <div class="chess-main-row">
                    <div class="chess-board-area">
                        <div class="chess-player-label top-label">${opponentRole}</div>
                        <div class="chess-board">
                            <!-- Board cells will be injected here -->
                        </div>
                        <div class="chess-player-label bottom-label">${viewerRole}</div>
                    </div>

                    <div class="chess-right-panel">
                        <div class="chess-history-panel">
                            <div class="chess-history-header">
                                <span class="chess-history-title">MOVE HISTORY</span>
                                <button class="chess-btn chess-history-live-btn" title="Jump to current position">&#9654; LIVE</button>
                            </div>
                            <div class="chess-history-list">
                                <!-- Moves injected here -->
                            </div>
                        </div>
                        <div class="chess-stats">
                            Admin: ${this.gameData.stats.admin_wins} | Users: ${this.gameData.stats.user_wins}
                        </div>
                    </div>
                </div>

                <div class="chess-controls">
                    <button class="chess-btn chess-reset-btn" ${this.isAdmin ? '' : 'style="display:none"'}>Reset Game</button>
                </div>
                
                <div class="chess-footer">
                    Powered by <a href="https://github.com/jhlywa/chess.js" target="_blank" style="color: #01301e; text-decoration: underline;">chess.js</a> (BSD-3-Clause)
                </div>
            </div>
        `;
    }

    setupSubscriptions() {
        this.currentSubscription = subscribeToSetting('chess_game', (payload) => {
            if (!payload || !payload.value) return;

            const newData = typeof payload.value === 'string' ? JSON.parse(payload.value) : payload.value;
            if (newData.fen !== this.game.fen()) {
                this.gameData = newData;
                if (!this.gameData.moves) this.gameData.moves = [];
                this.game.load(newData.fen);
                // If we were in live view, stay live and animate to new move
                if (this.historyBrowseIndex === null) {
                    this.updateBoard();
                }
                this.updateStatus();
                this.updateStats();
                this.updateMoveHistory();
                this.updateDesktopIcon();
            }
        });

        // Cleanup on window close
        this.window.element.addEventListener('window-closed', () => {
            if (this.currentSubscription) {
                this.currentSubscription.unsubscribe();
                this.currentSubscription = null;
            }
        });
    }

    setupEventListeners() {
        const resetBtn = this.window.element.querySelector('.chess-reset-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', async () => {
                // Re-check auth at click time in case they logged in after opening the window
                if (!isAdminSession()) {
                    const granted = await requireAdmin();
                    if (!granted) return;
                    this.isAdmin = true;
                }
                if (confirm("Reset current game? Stats will be preserved.")) {
                    this.resetGame();
                }
            });
        }

        const liveBtn = this.window.element.querySelector('.chess-history-live-btn');
        if (liveBtn) {
            liveBtn.addEventListener('click', () => {
                this.historyBrowseIndex = null;
                this.updateBoard();
                this.updateMoveHistory();
            });
        }
    }

    onCellClick(square) {
        if (!this.isMyTurn()) return;

        if (this.selectedSquare === square) {
            this.selectedSquare = null;
            this.updateBoard();
            return;
        }

        // Potential Move?
        if (this.selectedSquare) {
            try {
                const move = this.game.move({
                    from: this.selectedSquare,
                    to: square,
                    promotion: 'q' // Always promote to queen for simplicity
                });

                if (move) {
                    this.onMoveMade(move);
                    this.selectedSquare = null;
                    return;
                }
            } catch (e) {
                // Illegal move, handle piece selection change or deselect
            }
        }

        // Selection?
        const piece = this.game.get(square);
        if (piece && piece.color === this.game.turn()) {
            this.selectedSquare = square;
            this.updateBoard();
        } else {
            this.selectedSquare = null;
            this.updateBoard();
        }
    }

    isMyTurn() {
        if (!this.gameData) return false;
        const currentTurn = this.game.turn(); // 'w' or 'b'
        const adminColorCode = this.gameData.adminPlayAs === 'white' ? 'w' : 'b';
        const isCurrentlyAdmin = isAdminSession();

        if (isCurrentlyAdmin) {
            return currentTurn === adminColorCode;
        } else {
            return currentTurn !== adminColorCode;
        }
    }

    async onMoveMade(move) {
        // Append SAN notation to our moves list
        if (!this.gameData.moves) this.gameData.moves = [];
        this.gameData.moves.push(move.san);

        // Stay in live view when WE make a move
        this.historyBrowseIndex = null;

        this.updateBoard();
        this.updateStatus();
        this.updateStats();
        this.updateMoveHistory();
        this.updateDesktopIcon();

        if (this.game.isGameOver()) {
            this.handleGameOver();
        } else {
            await this.syncGameState();
        }
    }

    updateDesktopIcon() {
        const icons = document.querySelectorAll('.icon');
        const chessIcon = Array.from(icons).find(icon => icon.querySelector('.icon-label').innerText.includes('Chess VS Admin'));

        if (chessIcon) {
            const isMyTurn = this.isMyTurn();
            let badge = chessIcon.querySelector('.turn-badge');

            if (isMyTurn) {
                if (!badge) {
                    badge = document.createElement('div');
                    badge.className = 'cloud-badge turn-badge';
                    badge.style.background = 'var(--color-orange)';
                    badge.innerText = 'YOUR MOVE';
                    chessIcon.appendChild(badge);
                }
            } else {
                if (badge) badge.remove();
            }
        }
    }

    async handleGameOver() {
        let winner = null;
        let stats = { ...this.gameData.stats };

        if (this.game.isCheckmate()) {
            const winnerCode = this.game.turn() === 'w' ? 'black' : 'white';
            const adminCode = this.gameData.adminPlayAs;

            if (winnerCode === adminCode) {
                winner = "Admin";
                stats.admin_wins++;
            } else {
                winner = "Users";
                stats.user_wins++;
            }
        }

        const msg = winner ? `${winner} wins!` : "Draw!";
        this.wm.alert(msg, "Game Over");

        // The winner plays white in the next game
        const nextAdminColor = (winner === "Admin" || (winner === null && this.gameData.adminPlayAs === 'white')) ? 'white' : 'black';

        this.gameData = {
            fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            turn: 'white',
            winner: winner,
            adminPlayAs: nextAdminColor,
            moves: [],
            stats: stats
        };

        this.historyBrowseIndex = null;
        this.game.load(this.gameData.fen);
        await this.syncGameState();
        this.updateBoard();
        this.updateStats();
        this.updateMoveHistory();
    }

    async syncGameState() {
        const state = {
            ...this.gameData,
            fen: this.game.fen(),
            turn: this.game.turn() === 'w' ? 'white' : 'black',
            moves: this.gameData.moves || []
        };

        try {
            // setSetting expects a JSON string for the value column
            await setSetting('chess_game', JSON.stringify(state));
        } catch (error) {
            console.error("Failed to sync chess game:", error);
            if (error?.message?.includes('relation') || error?.code === '42P01') {
                this.wm.alert("Database not set up yet! Run the SQL setup in your Supabase SQL editor first.", "Setup Required");
            } else {
                this.wm.alert("Connection error! Could not sync move: " + error.message, "Error");
            }
        }
    }

    async resetGame() {
        this.gameData = this.createInitialState();
        this.historyBrowseIndex = null;
        this.game.load(this.gameData.fen);
        await this.syncGameState();
        this.updateBoard();
        this.updateStats();
        this.updateMoveHistory();
    }

    /**
     * Render a board state.
     * @param {Object|null} gameInstance - chess.js instance to render; defaults to live this.game
     * @param {string|null} highlightFrom - square to mark as 'last-move-from'
     * @param {string|null} highlightTo   - square to mark as 'last-move-to'
     */
    updateBoard(gameInstance = null, highlightFrom = null, highlightTo = null) {
        if (!this.boardElement) return;
        this.boardElement.innerHTML = '';

        const src = gameInstance || this.game;
        const board = src.board();
        const isBrowsing = this.historyBrowseIndex !== null;

        // Determine orientation: board should face the user (their color on bottom)
        const isAdmin = isAdminSession();
        const adminColor = this.gameData.adminPlayAs; // 'white' or 'black'
        const userColor = isAdmin ? adminColor : (adminColor === 'white' ? 'black' : 'white');
        const flip = userColor === 'black';

        for (let r_prime = 0; r_prime < 8; r_prime++) {
            for (let c_prime = 0; c_prime < 8; c_prime++) {
                const r = flip ? (7 - r_prime) : r_prime;
                const c = flip ? (7 - c_prime) : c_prime;

                const square = String.fromCharCode(97 + c) + (8 - r);
                const isLight = (r + c) % 2 === 0;
                const piece = board[r][c];

                const cell = document.createElement('div');
                cell.className = `chess-cell ${isLight ? 'light' : 'dark'}`;
                if (!isBrowsing && this.selectedSquare === square) cell.classList.add('highlight');
                if (square === highlightFrom) cell.classList.add('last-move-from');
                if (square === highlightTo) cell.classList.add('last-move-to');

                if (piece) {
                    const pieceEl = document.createElement('div');
                    pieceEl.className = 'chess-piece';

                    const img = document.createElement('img');
                    img.src = this.getPieceImageUrl(piece);
                    img.alt = piece.color + piece.type;
                    img.style.width = '100%';
                    img.style.height = '100%';
                    img.style.objectFit = 'contain';
                    img.style.display = 'block';
                    img.style.imageRendering = 'pixelated';

                    img.onerror = () => {
                        pieceEl.removeChild(img);
                        pieceEl.textContent = this.getPieceSymbol(piece);
                    };

                    pieceEl.appendChild(img);
                    cell.appendChild(pieceEl);
                }

                // Disable clicks when browsing history
                if (!isBrowsing) {
                    cell.addEventListener('click', () => this.onCellClick(square));
                } else {
                    cell.style.cursor = 'default';
                }
                this.boardElement.appendChild(cell);
            }
        }
    }

    /**
     * Render or refresh the move history panel.
     */
    updateMoveHistory() {
        const list = this.window?.element?.querySelector('.chess-history-list');
        const liveBtn = this.window?.element?.querySelector('.chess-history-live-btn');
        if (!list) return;

        const moves = this.gameData.moves || [];
        list.innerHTML = '';

        if (moves.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'chess-history-empty';
            empty.textContent = 'No moves yet.';
            list.appendChild(empty);
            if (liveBtn) liveBtn.style.display = 'none';
            return;
        }

        if (liveBtn) liveBtn.style.display = '';

        // Pair moves into rows: 1. e4 e5 / 2. Nf3 Nc6 …
        for (let i = 0; i < moves.length; i += 2) {
            const row = document.createElement('div');
            row.className = 'chess-history-row';

            const num = document.createElement('span');
            num.className = 'chess-history-num';
            num.textContent = `${Math.floor(i / 2) + 1}.`;
            row.appendChild(num);

            // White's move (index i)
            const wCell = this._makeHistoryCell(moves[i], i);
            row.appendChild(wCell);

            // Black's move (index i+1, may not exist yet)
            if (i + 1 < moves.length) {
                const bCell = this._makeHistoryCell(moves[i + 1], i + 1);
                row.appendChild(bCell);
            } else {
                // Placeholder so layout stays even
                const blank = document.createElement('span');
                blank.className = 'chess-history-move';
                row.appendChild(blank);
            }

            list.appendChild(row);
        }

        // Update active highlight
        this._refreshHistoryHighlight();

        // Auto-scroll to the bottom (latest move) when in live view
        if (this.historyBrowseIndex === null) {
            list.scrollTop = list.scrollHeight;
        }
    }

    _makeHistoryCell(san, moveIndex) {
        const cell = document.createElement('span');
        cell.className = 'chess-history-move';
        cell.dataset.moveIndex = moveIndex;
        cell.textContent = san;
        cell.addEventListener('click', () => this._browseToMove(moveIndex));
        return cell;
    }

    _browseToMove(moveIndex) {
        const moves = this.gameData.moves || [];
        if (moveIndex >= moves.length) return;

        // Replay from the start up to moveIndex (inclusive)
        const replay = new Chess();
        let lastMove = null;
        for (let i = 0; i <= moveIndex; i++) {
            lastMove = replay.move(moves[i]);
        }

        // If we're browsing to the very last move (= live position),
        // stay in live mode so the board remains clickable.
        const isLastMove = moveIndex === moves.length - 1;
        this.historyBrowseIndex = isLastMove ? null : moveIndex;

        this.updateBoard(
            isLastMove ? null : replay,
            lastMove?.from || null,
            lastMove?.to || null
        );
        this._refreshHistoryHighlight();
    }

    _refreshHistoryHighlight() {
        const list = this.window?.element?.querySelector('.chess-history-list');
        if (!list) return;

        list.querySelectorAll('.chess-history-move').forEach(el => {
            el.classList.remove('active');
        });

        if (this.historyBrowseIndex !== null) {
            const active = list.querySelector(`[data-move-index="${this.historyBrowseIndex}"]`);
            if (active) {
                active.classList.add('active');
                active.scrollIntoView({ block: 'nearest' });
            }
        }
    }

    getPieceImageUrl(piece) {
        return PIECE_IMAGES[piece.color + piece.type];
    }

    getPieceSymbol(piece) {
        const symbols = {
            'w': { 'p': '♙', 'r': '♖', 'n': '♘', 'b': '♗', 'q': '♕', 'k': '♔' },
            'b': { 'p': '♟', 'r': '♜', 'n': '♞', 'b': '♝', 'q': '♛', 'k': '♚' }
        };
        return symbols[piece.color][piece.type];
    }

    updateStatus() {
        const isMyTurn = this.isMyTurn();
        const turnLabel = isMyTurn ? "YOUR MOVE" : "";
        const turnClass = isMyTurn ? "chess-status-your-move" : "chess-status-hidden";

        const badge = this.window.element.querySelector('.chess-status-badge');
        if (badge) {
            badge.innerText = turnLabel;
            badge.className = `chess-status-badge ${turnClass}`;
        }

        const text = this.window.element.querySelector('.chess-status-text');
        if (text) {
            text.innerText = `Turn: ${this.getTurnLabel(this.game.turn())}`;
        }

        // Update Reset button visibility live (in case they logged in while window was open)
        const resetBtn = this.window.element.querySelector('.chess-reset-btn');
        if (resetBtn) {
            resetBtn.style.display = isAdminSession() ? '' : 'none';
        }
    }

    updateStats() {
        const statsEl = this.window.element.querySelector('.chess-stats');
        if (statsEl && this.gameData && this.gameData.stats) {
            statsEl.innerText = `Admin: ${this.gameData.stats.admin_wins} | Users: ${this.gameData.stats.user_wins}`;
        }
    }

    getTurnLabel(code) {
        if (!this.gameData) return code === 'w' ? 'White' : 'Black';
        const isAdminWhite = this.gameData.adminPlayAs === 'white';
        if (code === 'w') {
            return isAdminWhite ? 'Admin' : 'User';
        } else {
            return isAdminWhite ? 'User' : 'Admin';
        }
    }
}
