// cloudfunctions/deleteMatch/index.js
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { matchId } = event

  try {
    // 1. 先查询这条比赛的详情（为了知道要扣谁的分）
    const matchRes = await db.collection('matches').doc(matchId).get()
    const match = matchRes.data

    // 2. 确定胜方和败方队伍
    let winners = []
    let losers = []

    if (match.winner === 'A') {
      winners = match.teamA // 数组 [{name: '张三'}, ...]
      losers = match.teamB
    } else {
      winners = match.teamB
      losers = match.teamA
    }

    // 3. 准备更新操作的 Promise 数组
    const tasks = []

    // 3.1 扣除胜者的 wins (胜场 -1)
    // 注意：这里我们假设 players 集合里是用 name 来标识的，且有 wins 字段
    for (const p of winners) {
      const task = db.collection('players')
        .where({ name: p.name })
        .update({
          data: {
            wins: _.inc(-1) // 自减1
          }
        })
      tasks.push(task)
    }

    // 3.2 扣除败者的 losses (负场 -1)
    for (const p of losers) {
      const task = db.collection('players')
        .where({ name: p.name })
        .update({
          data: {
            losses: _.inc(-1) // 自减1
          }
        })
      tasks.push(task)
    }

    // 4. 等待所有玩家数据更新完毕
    await Promise.all(tasks)

    // 5. 最后删除比赛记录
    await db.collection('matches').doc(matchId).remove()

    return {
      success: true,
      message: '删除成功，战绩已回滚'
    }

  } catch (e) {
    console.error(e)
    return {
      success: false,
      errMsg: e.message
    }
  }
}