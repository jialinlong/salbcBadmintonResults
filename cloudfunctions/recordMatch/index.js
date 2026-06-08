// cloudfunctions/recordMatch/index.js
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  console.log('接收到的参数:', event) // 1. 在云端日志打印参数

  const { teamA, teamB, scoreA, scoreB } = event

  // 安全检查：防止数据缺失导致崩溃
  if (!teamA || !teamB || teamA.length < 2 || teamB.length < 2) {
    return { success: false, msg: '队伍人员数据缺失', error: event }
  }

  try {
    const winnerTeam = scoreA > scoreB ? 'A' : 'B';
    
    // 提取 ID，加了 ?. 防止报错
    const teamA_Ids = teamA.map(p => p?._id);
    const teamB_Ids = teamB.map(p => p?._id);

    // 检查 ID 是否存在
    if (teamA_Ids.includes(undefined) || teamB_Ids.includes(undefined)) {
       return { success: false, msg: '有球员缺少_id字段', teamA_Ids, teamB_Ids }
    }
    
    const winners = winnerTeam === 'A' ? teamA_Ids : teamB_Ids;
    const losers = winnerTeam === 'A' ? teamB_Ids : teamA_Ids;

    // 2. 写入比赛记录
    await db.collection('matches').add({
      data: {
        createTime: db.serverDate(),
        teamA, 
        teamB,
        scoreA,
        scoreB,
        winner: winnerTeam
      }
    });

    // 3. 更新赢家
    await db.collection('players').where({
      _id: _.in(winners)
    }).update({
      data: {
        total_matches: _.inc(1),
        wins: _.inc(1)
      }
    });

    // 4. 更新输家
    await db.collection('players').where({
      _id: _.in(losers)
    }).update({
      data: {
        total_matches: _.inc(1),
        losses: _.inc(1)
      }
    });

    return { success: true, msg: 'OK' }

  } catch (err) {
    // 这里会捕获具体的数据库错误
    console.error('云函数报错:', err)
    return {
      success: false,
      msg: '执行过程中报错',
      error: err.message || err // 返回错误文本
    }
  }
}