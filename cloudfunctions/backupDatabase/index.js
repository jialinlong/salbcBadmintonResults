// 云函数：backupDatabase (兼容导入格式)
const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})
const db = cloud.database()

exports.main = async (event, context) => {
  console.log('开始执行数据库备份任务...')
  
  try {
    // 1. 备份数据
    const collections = ['matches', 'players']
    const backupData = {}
    let totalRecords = 0
    
    for (let collectionName of collections) {
      console.log(`正在备份集合: ${collectionName}`)
      const allData = await getAllData(collectionName)
      backupData[collectionName] = allData
      totalRecords += allData.length
      console.log(`${collectionName} 备份完成，共 ${allData.length} 条数据`)
    }
    
    // 2. 转换为可导入格式（JSONL格式）
    const now = new Date()
    const dateStr = now.toISOString().split('T')[0]
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-')
    
    // 为每个集合单独保存备份文件
    const uploadedFiles = []
    for (let collectionName in backupData) {
      const fileName = `backup_${collectionName}_${dateStr}_${timeStr}.json`
      const cloudPath = `database-backup/${fileName}`
      
      // 转换为JSONL格式（每行一个JSON对象）
      const jsonlContent = convertToJSONL(backupData[collectionName])
      
      const uploadRes = await cloud.uploadFile({
        cloudPath: cloudPath,
        fileContent: Buffer.from(jsonlContent)
      })
      
      uploadedFiles.push({
        collection: collectionName,
        fileName: fileName,
        fileID: uploadRes.fileID,
        count: backupData[collectionName].length
      })
      
      console.log(`${collectionName} 备份文件已保存: ${fileName}`)
    }
    
    // 3. 记录备份信息（可选）
    try {
      await db.collection('backup_records').add({
        data: {
          backupTime: db.serverDate(),
          backupTimestamp: Date.now(),
          totalRecords: totalRecords,
          files: uploadedFiles,
          collections: Object.keys(backupData).map(name => ({
            name,
            count: backupData[name].length
          }))
        }
      })
    } catch (recordErr) {
      console.warn('保存备份记录失败（不影响备份）:', recordErr.message)
    }
    
    // 4. 清理14天前的备份
    let deletedCount = 0
    try {
      const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000
      const oldBackups = await db.collection('backup_records')
        .where({
          backupTimestamp: db.command.lt(fourteenDaysAgo)
        })
        .get()
      
      for (let backup of oldBackups.data) {
        // 删除所有关联的备份文件
        const fileList = backup.files.map(f => f.fileID)
        if (fileList.length > 0) {
          await cloud.deleteFile({ fileList })
        }
        // 删除数据库记录
        await db.collection('backup_records').doc(backup._id).remove()
        deletedCount++
        console.log(`已删除过期备份: ${backup._id}`)
      }
    } catch (deleteErr) {
      console.warn('清理旧备份失败:', deleteErr.message)
    }
    
    return {
      success: true,
      message: '备份成功',
      uploadedFiles: uploadedFiles,
      totalRecords: totalRecords,
      deletedOldBackups: deletedCount,
      timestamp: now.toISOString()
    }
    
  } catch (err) {
    console.error('备份失败:', err)
    return {
      success: false,
      error: err.message,
      timestamp: new Date().toISOString()
    }
  }
}

// 分批获取集合所有数据
async function getAllData(collectionName) {
  const MAX_LIMIT = 100
  let allData = []
  let offset = 0
  let hasMore = true
  
  while (hasMore) {
    const res = await db.collection(collectionName)
      .skip(offset)
      .limit(MAX_LIMIT)
      .get()
    
    allData = allData.concat(res.data)
    offset += MAX_LIMIT
    hasMore = res.data.length === MAX_LIMIT
  }
  
  return allData
}

// 转换为JSONL格式（兼容云开发导入）
function convertToJSONL(dataArray) {
  return dataArray.map(item => {
    // 转换日期字段为云开发格式
    const convertedItem = {}
    for (let key in item) {
      if (item[key] instanceof Date) {
        convertedItem[key] = { $date: item[key].toISOString() }
      } else if (typeof item[key] === 'object' && item[key] !== null && item[key].$date) {
        // 已经是云开发日期格式，保持不变
        convertedItem[key] = item[key]
      } else if (typeof item[key] === 'string' && isISODateString(item[key])) {
        // 字符串日期转换为云开发格式
        convertedItem[key] = { $date: item[key] }
      } else {
        convertedItem[key] = item[key]
      }
    }
    return JSON.stringify(convertedItem)
  }).join('\n')
}

// 判断是否为ISO日期字符串
function isISODateString(str) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/.test(str)
}