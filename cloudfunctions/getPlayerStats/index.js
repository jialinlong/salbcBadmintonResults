// cloudfunctions/getPlayerStats/index.js
// 获取个人详细统计数据

const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

/**
 * 格式化日期 M/D
 */
function formatDate(date) {
  const m = date.getMonth() + 1
  const d = date.getDate()
  return `${m}/${d}`
}

/**
 * 格式化完整日期 YYYY.M.D
 */
function formatFullDate(date) {
  const y = date.getFullYear()
  const m = date.getMonth() + 1
  const d = date.getDate()
  return `${y}.${m}.${d}`
}

/**
 * 计算成就徽章
 */
function calculateAchievements(stats) {
  const achievements = []
  const { totalMatches, wins, maxStreak, biggestWin, activeDays, totalPartners, winRate } = stats

  // 场次里程碑
  if (totalMatches >= 1) achievements.push({ id: 'first_match', name: '初出茅庐', desc: '完成首场比赛', icon: '🎾', unlocked: true })
  if (totalMatches >= 10) achievements.push({ id: 'matches_10', name: '小试牛刀', desc: '累计10场比赛', icon: '🏸', unlocked: true })
  if (totalMatches >= 50) achievements.push({ id: 'matches_50', name: '身经百战', desc: '累计50场比赛', icon: '⚡', unlocked: true })
  if (totalMatches >= 100) achievements.push({ id: 'matches_100', name: '百战老兵', desc: '累计100场比赛', icon: '🏆', unlocked: true })
  if (totalMatches >= 200) achievements.push({ id: 'matches_200', name: '传奇球手', desc: '累计200场比赛', icon: '👑', unlocked: true })

  // 胜场里程碑
  if (wins >= 1) achievements.push({ id: 'first_win', name: '首胜之喜', desc: '获得首场胜利', icon: '✨', unlocked: true })
  if (wins >= 50) achievements.push({ id: 'wins_50', name: '常胜将军', desc: '累计50场胜利', icon: '🎖️', unlocked: true })
  if (wins >= 100) achievements.push({ id: 'wins_100', name: '百胜王者', desc: '累计100场胜利', icon: '💎', unlocked: true })

  // 连胜成就
  if (maxStreak >= 3) achievements.push({ id: 'streak_3', name: '三连胜', desc: '达成3连胜', icon: '🔥', unlocked: true })
  if (maxStreak >= 5) achievements.push({ id: 'streak_5', name: '五连胜', desc: '达成5连胜', icon: '💪', unlocked: true })
  if (maxStreak >= 10) achievements.push({ id: 'streak_10', name: '十连胜', desc: '达成10连胜', icon: '🌟', unlocked: true })

  // 胜率成就
  if (totalMatches >= 10 && winRate >= 60) achievements.push({ id: 'rate_60', name: '稳定输出', desc: '胜率超过60%', icon: '📈', unlocked: true })
  if (totalMatches >= 20 && winRate >= 70) achievements.push({ id: 'rate_70', name: '高胜率', desc: '胜率超过70%', icon: '🚀', unlocked: true })

  // 分差成就
  if (biggestWin >= 10) achievements.push({ id: 'big_win_10', name: '碾压局', desc: '单场赢10分以上', icon: '💥', unlocked: true })
  if (biggestWin >= 15) achievements.push({ id: 'big_win_15', name: '完美碾压', desc: '单场赢15分以上', icon: '🎯', unlocked: true })

  // 活跃成就
  if (activeDays >= 7) achievements.push({ id: 'active_7', name: '周常球友', desc: '活跃7天', icon: '📅', unlocked: true })
  if (activeDays >= 30) achievements.push({ id: 'active_30', name: '月度达人', desc: '活跃30天', icon: '🗓️', unlocked: true })

  // 社交成就
  if (totalPartners >= 5) achievements.push({ id: 'partners_5', name: '社交达人', desc: '与5位搭档合作', icon: '🤝', unlocked: true })
  if (totalPartners >= 10) achievements.push({ id: 'partners_10', name: '人缘王', desc: '与10位搭档合作', icon: '👥', unlocked: true })

  return achievements
}

/**
 * 计算下一个成就进度
 */
function getNextAchievements(stats) {
  const { totalMatches, wins, maxStreak, activeDays, totalPartners } = stats
  const next = []

  // 场次进度
  const matchMilestones = [10, 50, 100, 200]
  for (const m of matchMilestones) {
    if (totalMatches < m) {
      next.push({ name: m === 10 ? '小试牛刀' : m === 50 ? '身经百战' : m === 100 ? '百战老兵' : '传奇球手', current: totalMatches, target: m, type: 'matches' })
      break
    }
  }

  // 胜场进度
  const winMilestones = [50, 100]
  for (const w of winMilestones) {
    if (wins < w) {
      next.push({ name: w === 50 ? '常胜将军' : '百胜王者', current: wins, target: w, type: 'wins' })
      break
    }
  }

  // 连胜进度
  const streakMilestones = [3, 5, 10]
  for (const s of streakMilestones) {
    if (maxStreak < s) {
      next.push({ name: s === 3 ? '三连胜' : s === 5 ? '五连胜' : '十连胜', current: maxStreak, target: s, type: 'streak' })
      break
    }
  }

  return next.slice(0, 2) // 最多显示2个进度
}

exports.main = async (event, context) => {
  const { playerName } = event

  if (!playerName) {
    return { success: false, errMsg: '缺少玩家名称' }
  }

  try {
    const _ = db.command
    const playerCondition = { name: playerName }
    
    // 获取玩家头像信息
    const playerRes = await db.collection('players')
      .where({ name: playerName })
      .get()
    const playerAvatar = playerRes.data.length > 0 ? playerRes.data[0].avatar || '' : ''
    
    const matchesRes = await db.collection('matches')
      .where(_.or([
        { teamA: _.elemMatch(playerCondition) },
        { teamB: _.elemMatch(playerCondition) }
      ]))
      .orderBy('createTime', 'desc')
      .limit(1000)
      .get()

    const matches = matchesRes.data
    const now = new Date()
    const currentMonth = now.getMonth()
    const currentYear = now.getFullYear()

    // 空数据返回
    if (matches.length === 0) {
      return {
        success: true,
        data: {
          avatar: playerAvatar,
          totalMatches: 0, wins: 0, losses: 0, winRate: 0, netScore: 0,
          currentStreak: 0, maxStreak: 0, streakType: '',
          bestPartners: [], bestAgainst: [], worstAgainst: [], recentMatches: [],
          firstMatchDate: '', activeDays: 0, monthMatches: 0, monthWins: 0,
          recentWinRate: 0, biggestWin: 0, totalPartners: 0, totalScore: 0,
          // 新增数据
          lastMonthMatches: 0, lastMonthWins: 0, lastMonthWinRate: 0,
          winRateTrend: [], achievements: [], nextAchievements: [],
          records: {}, calendarData: [], goldenPartner: null, singleDayMax: 0
        }
      }
    }

    // ========== 基础统计变量 ==========
    let wins = 0, losses = 0, netScore = 0, totalScore = 0
    let biggestWin = 0, singleDayMax = 0
    let maxWinStreak = 0, maxLoseStreak = 0
    let tempWinStreak = 0, tempLoseStreak = 0, lastResult = null
    let monthMatches = 0, monthWins = 0
    let lastMonthMatches = 0, lastMonthWins = 0

    const partnerStats = {}
    const opponentStats = {}
    const activeDaysSet = new Set()
    const dailyMatchCount = {}  // 每日场次统计
    const calendarMap = {}      // 本月日历数据

    // ========== 胜率趋势数据 ==========
    const winRateTrend = []
    let trendWins = 0

    // 按时间正序处理
    const sortedMatches = [...matches].sort((a, b) => 
      new Date(a.createTime) - new Date(b.createTime)
    )

    const firstMatchDate = sortedMatches.length > 0 
      ? formatFullDate(new Date(sortedMatches[0].createTime))
      : ''

    // ========== 遍历所有比赛 ==========
    sortedMatches.forEach((match, index) => {
      const matchDate = new Date(match.createTime)
      const scoreA = parseInt(match.scoreA) || 0
      const scoreB = parseInt(match.scoreB) || 0
      const scoreDiff = Math.abs(scoreA - scoreB)

      const inTeamA = match.teamA.some(p => p.name === playerName)
      const myTeam = inTeamA ? match.teamA : match.teamB
      const opponentTeam = inTeamA ? match.teamB : match.teamA
      const myScore = inTeamA ? scoreA : scoreB
      const isWin = (inTeamA && match.winner === 'A') || (!inTeamA && match.winner === 'B')

      totalScore += myScore

      // 活跃天数 & 单日最多场
      const dayKey = `${matchDate.getFullYear()}-${matchDate.getMonth() + 1}-${matchDate.getDate()}`
      activeDaysSet.add(dayKey)
      dailyMatchCount[dayKey] = (dailyMatchCount[dayKey] || 0) + 1
      if (dailyMatchCount[dayKey] > singleDayMax) singleDayMax = dailyMatchCount[dayKey]

      // 本月日历数据
      if (matchDate.getMonth() === currentMonth && matchDate.getFullYear() === currentYear) {
        const day = matchDate.getDate()
        if (!calendarMap[day]) calendarMap[day] = { matches: 0, wins: 0 }
        calendarMap[day].matches++
        if (isWin) calendarMap[day].wins++
        monthMatches++
        if (isWin) monthWins++
      }

      // 上月统计
      const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1
      const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear
      if (matchDate.getMonth() === lastMonth && matchDate.getFullYear() === lastMonthYear) {
        lastMonthMatches++
        if (isWin) lastMonthWins++
      }

      // 基础统计
      if (isWin) {
        wins++
        trendWins++
        netScore += scoreDiff
        if (scoreDiff > biggestWin) biggestWin = scoreDiff
      } else {
        losses++
        netScore -= scoreDiff
      }

      // 胜率趋势（每5场记录一个点，最多20个点）
      if ((index + 1) % 5 === 0 || index === sortedMatches.length - 1) {
        const rate = Math.round((trendWins / (index + 1)) * 100)
        winRateTrend.push({ match: index + 1, rate })
      }

      // 搭档统计
      myTeam.forEach(p => {
        if (p.name !== playerName) {
          if (!partnerStats[p.name]) partnerStats[p.name] = { wins: 0, total: 0 }
          partnerStats[p.name].total++
          if (isWin) partnerStats[p.name].wins++
        }
      })

      // 对手统计
      opponentTeam.forEach(p => {
        if (!opponentStats[p.name]) opponentStats[p.name] = { wins: 0, losses: 0 }
        if (isWin) opponentStats[p.name].wins++
        else opponentStats[p.name].losses++
      })

      // 连胜计算
      if (isWin) {
        tempWinStreak++
        tempLoseStreak = 0
        if (tempWinStreak > maxWinStreak) maxWinStreak = tempWinStreak
      } else {
        tempLoseStreak++
        tempWinStreak = 0
        if (tempLoseStreak > maxLoseStreak) maxLoseStreak = tempLoseStreak
      }
      lastResult = isWin
    })

    // ========== 处理结果数据 ==========
    const currentStreak = lastResult ? tempWinStreak : tempLoseStreak
    const streakType = lastResult ? 'win' : 'lose'
    const totalMatches = wins + losses
    const winRate = totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0

    // 近10场胜率
    let recentWins = 0
    const recentCount = Math.min(10, matches.length)
    matches.slice(0, recentCount).forEach(match => {
      const inTeamA = match.teamA.some(p => p.name === playerName)
      const isWin = (inTeamA && match.winner === 'A') || (!inTeamA && match.winner === 'B')
      if (isWin) recentWins++
    })
    const recentWinRate = recentCount > 0 ? Math.round((recentWins / recentCount) * 100) : 0

    // 上月胜率
    const lastMonthWinRate = lastMonthMatches > 0 ? Math.round((lastMonthWins / lastMonthMatches) * 100) : 0

    // 最近10场详情
    const recentMatches = matches.slice(0, 10).map(match => {
      const inTeamA = match.teamA.some(p => p.name === playerName)
      const myTeam = inTeamA ? match.teamA : match.teamB
      const opponentTeam = inTeamA ? match.teamB : match.teamA
      const isWin = (inTeamA && match.winner === 'A') || (!inTeamA && match.winner === 'B')
      return {
        isWin,
        myTeam: myTeam.map(p => p.name).join(','),
        opponentTeam: opponentTeam.map(p => p.name).join(','),
        score: `${match.scoreA}:${match.scoreB}`,
        date: formatDate(new Date(match.createTime))
      }
    })

    // 搭档处理
    const allPartners = Object.entries(partnerStats)
      .map(([name, stat]) => ({
        name,
        matches: stat.total,
        wins: stat.wins,
        winRate: stat.total > 0 ? Math.round((stat.wins / stat.total) * 100) : 0
      }))

    const bestPartners = allPartners
      .filter(p => p.matches >= 3)
      .sort((a, b) => b.winRate - a.winRate || b.matches - a.matches)
      .slice(0, 5)

    // 黄金搭档：合作最多且胜率>=50%的搭档
    const goldenPartner = allPartners
      .filter(p => p.matches >= 5 && p.winRate >= 50)
      .sort((a, b) => (b.matches * b.winRate) - (a.matches * a.winRate))[0] || null

    const totalPartners = Object.keys(partnerStats).length

    // 对手处理
    const allOpponents = Object.entries(opponentStats)
      .map(([name, stat]) => ({
        name,
        wins: stat.wins,
        losses: stat.losses,
        total: stat.wins + stat.losses,
        winRate: (stat.wins + stat.losses) > 0 ? Math.round((stat.wins / (stat.wins + stat.losses)) * 100) : 0
      }))
      .filter(o => o.total >= 3)

    const bestAgainst = [...allOpponents].sort((a, b) => b.winRate - a.winRate || b.total - a.total).slice(0, 3)
    const worstAgainst = [...allOpponents].sort((a, b) => a.winRate - b.winRate || b.total - a.total).slice(0, 3)

    // 日历数据（本月）
    const calendarData = []
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate()
    for (let d = 1; d <= daysInMonth; d++) {
      calendarData.push({
        day: d,
        matches: calendarMap[d]?.matches || 0,
        wins: calendarMap[d]?.wins || 0
      })
    }

    // 个人记录
    const records = {
      biggestWin,
      maxWinStreak,
      maxLoseStreak,
      singleDayMax,
      totalScore
    }

    // 成就计算
    const achievementStats = { totalMatches, wins, maxStreak: maxWinStreak, biggestWin, activeDays: activeDaysSet.size, totalPartners, winRate }
    const achievements = calculateAchievements(achievementStats)
    const nextAchievements = getNextAchievements(achievementStats)

    return {
      success: true,
      data: {
        avatar: playerAvatar,
        totalMatches, wins, losses, winRate, netScore,
        currentStreak, maxStreak: maxWinStreak, streakType,
        bestPartners, bestAgainst, worstAgainst, recentMatches,
        firstMatchDate, activeDays: activeDaysSet.size,
        monthMatches, monthWins, recentWinRate, biggestWin, totalPartners, totalScore,
        // 新增数据
        lastMonthMatches, lastMonthWins, lastMonthWinRate,
        winRateTrend: winRateTrend.slice(-12), // 最近12个点
        achievements,
        nextAchievements,
        records,
        calendarData,
        goldenPartner,
        singleDayMax
      }
    }
  } catch (err) {
    console.error('getPlayerStats 错误:', err)
    return { success: false, errMsg: err.message }
  }
}
