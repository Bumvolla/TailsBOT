import 'dotenv/config';

import mysql from 'mysql2/promise';

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

export async function add_active_game(id, user_id, objecy_name) {
    const sql = 'INSERT INTO active_games (id, user_id, object_name) VALUES (?, ?, ?)';
    const values = [id, user_id, objecy_name];
   await pool.execute(sql, values);
}

export async function get_active_game(id) {
    const [rows] = await pool.execute('SELECT * FROM active_games WHERE id = ?', [id]);
    return rows[0];
}

export async function move_to_finished_game(gameId, opponentId, oponent_object_name, winnerId) {
    const [rows] = await pool.execute('SELECT * FROM active_games WHERE id = ?', [gameId]);
    const game = rows[0];

    await pool.execute('INSERT INTO finished_games (id, user_id, object_name, opponent_id, opponent_object_name, winner_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  [game.id, game.user_id, game.object_name, opponentId, oponent_object_name, winnerId, game.created_at]
);
    await pool.execute('DELETE FROM active_games WHERE id = ?', [gameId]);
}
