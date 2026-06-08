// cloudfunctions/updatePlayerPinyin/index.js
const cloud = require('wx-server-sdk')
const { toPinyin } = require('./pinyin')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { dryRun = true } = event // 默认为预览模式，不实际修改数据
  
  try {
    const result = {
      success: true,
      dryRun,
      playersUpdated: 0,
      matchesUpdated: 0,
      playersList: [],
      errors: []
    }
    
    console.log(`===== 开始数据清洗 (${dryRun ? '预览模式' : '执行模式'}) =====`)
    
    // ========== 步骤1: 更新 players 集合 ==========
    console.log('\n--- 步骤1: 查找缺少拼音字段的选手 ---')
    
    const playersResult = await db.collection('players')
      .where({
        firstLetters: _.exists(false)
      })
      .get()
    
    const players = playersResult.data
    console.log(`找到 ${players.length} 个需要更新的选手`)
    
    for (let player of players) {
      const pinyin = toPinyin(player.name)
      
      console.log(`选手: ${player.name}`)
      console.log(`  全拼: ${pinyin.fullPinyin}`)
      console.log(`  首字母: ${pinyin.firstLetters}`)
      
      result.playersList.push({
        _id: player._id,
        name: player.name,
        ...pinyin
      })
      
      if (!dryRun) {
        try {
          await db.collection('players')
            .doc(player._id)
            .update({
              data: {
                firstLetters: pinyin.firstLetters,
                fullPinyin: pinyin.fullPinyin
              }
            })
          result.playersUpdated++
        } catch (err) {
          console.error(`更新选手 ${player.name} 失败:`, err)
          result.errors.push({
            type: 'player',
            id: player._id,
            name: player.name,
            error: err.message
          })
        }
      }
    }
    
    // ========== 步骤2: 更新 matches 集合中的嵌套选手数据 ==========
    console.log('\n--- 步骤2: 更新比赛记录中的选手信息 ---')
    
    // 分批查询所有比赛记录
    const MAX_LIMIT = 100
    let matchesTotal = 0
    let hasMore = true
    let skip = 0
    
    while (hasMore) {
      const matchesResult = await db.collection('matches')
        .skip(skip)
        .limit(MAX_LIMIT)
        .get()
      
      const matches = matchesResult.data
      
      if (matches.length === 0) {
        hasMore = false
        break
      }
      
      for (let match of matches) {
        let needUpdate = false
        let updatedTeamA = []
        let updatedTeamB = []
        
        // 检查并更新 teamA
        for (let player of match.teamA) {
          if (!player.firstLetters || !player.fullPinyin) {
            needUpdate = true
            const pinyin = toPinyin(player.name)
            updatedTeamA.push({
              ...player,
              firstLetters: pinyin.firstLetters,
              fullPinyin: pinyin.fullPinyin
            })
            console.log(`  比赛 ${match._id} - TeamA: ${player.name} -> ${pinyin.fullPinyin}`)
          } else {
            updatedTeamA.push(player)
          }
        }
        
        // 检查并更新 teamB
        for (let player of match.teamB) {
          if (!player.firstLetters || !player.fullPinyin) {
            needUpdate = true
            const pinyin = toPinyin(player.name)
            updatedTeamB.push({
              ...player,
              firstLetters: pinyin.firstLetters,
              fullPinyin: pinyin.fullPinyin
            })
            console.log(`  比赛 ${match._id} - TeamB: ${player.name} -> ${pinyin.fullPinyin}`)
          } else {
            updatedTeamB.push(player)
          }
        }
        
        if (needUpdate) {
          matchesTotal++
          
          if (!dryRun) {
            try {
              await db.collection('matches')
                .doc(match._id)
                .update({
                  data: {
                    teamA: updatedTeamA,
                    teamB: updatedTeamB
                  }
                })
              result.matchesUpdated++
            } catch (err) {
              console.error(`更新比赛 ${match._id} 失败:`, err)
              result.errors.push({
                type: 'match',
                id: match._id,
                error: err.message
              })
            }
          }
        }
      }
      
      skip += MAX_LIMIT
    }
    
    console.log(`\n找到 ${matchesTotal} 场需要更新的比赛`)
    
    // ========== 结果汇总 ==========
    console.log('\n===== 数据清洗完成 =====')
    console.log(`模式: ${dryRun ? '预览' : '执行'}`)
    console.log(`需更新选手: ${players.length} 个`)
    console.log(`需更新比赛: ${matchesTotal} 场`)
    
    if (!dryRun) {
      console.log(`实际更新选手: ${result.playersUpdated} 个`)
      console.log(`实际更新比赛: ${result.matchesUpdated} 场`)
      console.log(`错误数量: ${result.errors.length}`)
    }
    
    return result
    
  } catch (err) {
    console.error('数据清洗失败:', err)
    return {
      success: false,
      error: err.message,
      stack: err.stack
    }
  }
}