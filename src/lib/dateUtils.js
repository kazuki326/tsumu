// src/lib/dateUtils.js
// 日付関連ユーティリティ関数

/**
 * 日付文字列に日数を加算/減算
 * @param {string} ymd - YYYY-MM-DD形式の日付
 * @param {number} n - 加算する日数（負数で減算）
 * @returns {string} YYYY-MM-DD形式の日付
 */
export const addDays = (ymd, n) => {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
};

/**
 * 2つの日付の差を日数で返す
 * @param {string} aYmd - YYYY-MM-DD形式の日付
 * @param {string} bYmd - YYYY-MM-DD形式の日付
 * @returns {number} b - a の日数
 */
export const daysDiff = (aYmd, bYmd) =>
  Math.floor((toDate(bYmd) - toDate(aYmd)) / 86400000);

/**
 * YYYY-MM-DD文字列をDateオブジェクトに変換
 * @param {string} ymd - YYYY-MM-DD形式の日付
 * @returns {Date}
 */
export const toDate = (ymd) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

/**
 * 数値をカンマ区切りでフォーマット
 * @param {number} n
 * @returns {string}
 */
export const formatNumber = (n) => Number(n).toLocaleString();
