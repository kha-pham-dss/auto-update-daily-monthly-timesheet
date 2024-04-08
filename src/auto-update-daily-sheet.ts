// https://id.atlassian.com/manage-profile/security/api-tokens
const memberNameList = [
    'Kha Pham',
    'Le Minh Tuan',
    'Hieu Nguyen',
    'Long Tran'
  ]
  
  const memberNamePICList = {
    'Kha Pham': 'Kha',
    'Le Minh Tuan': 'Tuan',
    'Hieu Nguyen': 'Hieu',
    'Long Tran': 'Long'
  }
  
  const blackListIssues = ['DEV-6161'];
  
  
  function getYesterdayDateTimeString() {
    const today = new Date();
    const yesterday = new Date(today);
  
    // get yesterday date
    yesterday.setDate(yesterday.getDate() - 1);
  
    const year = yesterday.getFullYear();
    // plus 1 cause month was count from 0
    const month = String(yesterday.getMonth() + 1).padStart(2, '0');
    const day = String(yesterday.getDate()).padStart(2, '0');
    const hour = String(yesterday.getHours()).padStart(2, '0');
    const minute = String(yesterday.getMinutes()).padStart(2, '0');
  
    // YYYY-MM-DD hh:mm
    return `${year}-${month}-${day} ${hour}:${minute}`;
  }
  
  function getAllIssuesByUpdatedDate() {
    var properties = PropertiesService.getScriptProperties();
    var options = {
      method: 'GET'
    };
    options.headers = { "Authorization": "Basic " + Utilities.base64Encode(properties.getProperty('email') + ":" + properties.getProperty('credential')) };
    const dateTime = getYesterdayDateTimeString();
    // fields = status,summary to fetch only summary and status of issues
    var response = UrlFetchApp.fetch(`https://earthbrain-sol.atlassian.net/rest/api/3/search?jql=${encodeURIComponent(`project = "DEV" AND (assignee WAS IN (61cbe154567cb700707d55ca, 6319935162fe1e6eac6df5ee, 62133836802e760075476b37, 62972bd1b407cc0069ffc56d)) AND status != "To Do" AND updatedDate >= '${dateTime}'`)}&fields=status,summary`, options);
    var issuesList = JSON.parse(response);
    var parsedDatas = {};
    issuesList.issues.forEach((issue) => {
      parsedDatas[issue.key] = {
        name: issue.fields.summary,
        status: issue.fields.status.name === '確認中' ? 'Resolved' : issue.fields.status.name,
      };
    })
    return parsedDatas;
  }
  
  // Valid: Time from being assigned until assigning a ticket to someone else must be more than 1 hour
  // If less than 1h, then there're at least 1 comment. 
  // Only validate new issues will be added
  // Return assignee if valid, null if invalid
  function validateIssue(ticketId, status) {
    if (blackListIssues.includes(ticketId)) return null;
    var properties = PropertiesService.getScriptProperties();
    var options = {
      method: 'GET'
    };
    options.headers = { "Authorization": "Basic " + Utilities.base64Encode(properties.getProperty('email') + ":" + properties.getProperty('credential')) };
    // https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-issueidorkey-changelog-get
    var response = UrlFetchApp.fetch(`https://earthbrain-sol.atlassian.net/rest/api/3/issue/${ticketId}/changelog`, options);
    var issueChangelogs = JSON.parse(response);
    // filter: get log when issue was assigned to member or member assign it to someone else
    const assigneeChangelogs = issueChangelogs.values.filter((log) => (log.items[0].field === 'assignee' && (memberNameList.includes(log.items[0].toString) || memberNameList.includes(log.items[0].fromString))));
    // calculate time
    var firstFlagTime = new Date(), secondFlagTime = new Date('1999-12-12');
    var assignee;
    assigneeChangelogs.forEach((log) => {
      if (memberNameList.includes(log.items[0].toString)
        && new Date(log.created).getTime() < firstFlagTime.getTime()) {
        firstFlagTime = new Date(log.created);
        assignee = log.items[0].toString;
      }
      if (memberNameList.includes(log.items[0].fromString)
        && new Date(log.created).getTime() > secondFlagTime.getTime()) {
        secondFlagTime = new Date(log.created);
        // if a member assign to another member, latest member will be save as assignee
        if (memberNameList.includes(log.items[0].toString) && assignee !== log.items[0].toString) {
          assignee = log.items[0].toString;
        }
      }
    })
    // if member still hold ticket, and not assign to anyone else
    if (secondFlagTime - new Date('1999-12-12') == 0) return assignee;
  
    const diffMinute = Math.ceil((Math.abs(secondFlagTime.getTime() - firstFlagTime.getTime())) / (1000 * 60));
    if (diffMinute < 60) {
      // https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-comments/#api-rest-api-3-issue-issueidorkey-comment-get
      var secondRespone = UrlFetchApp.fetch(`https://earthbrain-sol.atlassian.net/rest/api/3/issue/${ticketId}/comment`, options);
      var commentsList = JSON.parse(secondRespone);
      if (commentsList.comments.some((comment) => comment.displayName == assignee)) return assignee;
    }
    return null;
  }
  
  // ticketId: {
  //   name: String,
  //   status: String,
  //   assignee: String,
  // }
  function updateSheetWithIssueDatas(sheet, issues) {
    var latestRowIndex;
    // get col B
    var ranges = sheet.getRangeList(['B:B']).getRanges();
    // if there're ${hideStreak} or more row was continuously hidden, all left will be skip
    const values = ranges[0].getValues();
    for (var i = values.length; i > 2; i--) {
      const value = values[i];
      // if value is a ticketID
      // check valid ticketID
      if (RegExp('^[A-Z]{1,}-[0-9]{1,}$').test(value)) {
        // save latestRowIndex
        if (!latestRowIndex) latestRowIndex = i;
        // issues contain all ticket was update in last 24h, status in sheet !== issue's current status
        // i - 1 is value right above ticketID = status of that ID, cause we're reading from bottom to top
        if (issues[value] !== undefined && issues[value].status !== values[i - 1]) {
          // cause col was count from 0 (B0), so this is B{i} instead of B{i-1}
          sheet.getRange(`B${i}`).setValue(issues[value].status);
        }
        // if there're issues was updated in last 24 hour, delete that issues[value], update status if nessecary
        // after loop was done, ticket was left in issues object will be ticket need to be add into sheet
        delete issues[value];
      }
    }
    // add 1 cause values was count from 0
    return [issues, latestRowIndex + 1];
  }
  
  function createNewRowWithIssueDatas(sheet, issues, latestRowIndex) {
    var lastTwoRowsRange = sheet.getRange(latestRowIndex - 1, 1, 2, sheet.getLastColumn());
    const listTicketId = Object.keys(issues);
    const numberRowsNeedAdd = listTicketId.length;
    for (var i = 0; i < numberRowsNeedAdd; i++) {
      // Create new rows: +1 to get next row after latestRowIndex, then + i*2 until end
      var newRowIndex = latestRowIndex + 1 + i * 2;
      lastTwoRowsRange.copyTo(sheet.getRange(newRowIndex, 1));
      // Update new rows
      // status
      sheet.getRange(`B${newRowIndex}`).setValue(issues[listTicketId[i]].status);
      // ticket ID
      sheet.getRange(`B${newRowIndex + 1}`).setValue(listTicketId[i]);
      // ticket summary
      sheet.getRange(`D${newRowIndex}`).setValue(issues[listTicketId[i]].name);
      // assignee
      sheet.getRange(`R${newRowIndex}`).setValue(issues[listTicketId[i]].assignee);
    }
  }
  
  function oneForAll() {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('All Sprint');
    // updateExistedIssuesOnSheet(sheet);
    const issues = getAllIssuesByUpdatedDate();
  
    const [leftOverIssues, latestRowIndex] = updateSheetWithIssueDatas(sheet, issues);
    Object.keys(leftOverIssues).forEach((ticketId) => {
      const validateResult = validateIssue(ticketId, leftOverIssues[ticketId]['status']);
      if (validateResult === null) { delete leftOverIssues[ticketId]; }
      else {
        leftOverIssues[ticketId]['assignee'] = memberNamePICList[validateIssue(ticketId)] ?? null;
      };
    })
    if (Object.keys(leftOverIssues.length > 0)) createNewRowWithIssueDatas(sheet, leftOverIssues, latestRowIndex);
  }
  