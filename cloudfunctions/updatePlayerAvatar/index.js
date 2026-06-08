// cloudfunctions/updatePlayerAvatar/index.js
// 更新玩家头像

const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const { playerName, avatarUrl } = event

  if (!playerName) {
    return { success: false, errMsg: '缺少玩家名称' }
  }

  try {
    // 查找玩家
    const playerRes = await db.collection('players')
      .where({ name: playerName })
      .get()

    if (playerRes.data.length === 0) {
      return { success: false, errMsg: '玩家不存在' }
    }

    const playerId = playerRes.data[0]._id

    // 更新头像
    await db.collection('players')
      .doc(playerId)
      .update({
        data: {
          avatar: avatarUrl || '',
          avatarUpdateTime: db.serverDate()
        }
      })

    return {
      success: true,
      avatar: avatarUrl
    }
  } catch (err) {
    console.error('updatePlayerAvatar 错误:', err)
    return {
      success: false,
      errMsg: err.message
    }
  }
}
