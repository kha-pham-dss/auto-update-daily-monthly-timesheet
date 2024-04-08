// JQL user code
// 61cbe154567cb700707d55ca = Kha Pham
// 6319935162fe1e6eac6df5ee = Le Minh Tuan
// 62133836802e760075476b37 = Hieu Nguyen
// 62972bd1b407cc0069ffc56d = Long Tran

// Change below const as needed
const userIdJQL = '61cbe154567cb700707d55ca';
const userName = 'Kha Pham';
// formatDate: 0 - JQL format: YYYY-MM-DD hh:mm
// 1 - raw date variable
// 2 - YYYY.MM
function getFristDayOfMonthDateTimeString(formatDate) {
  const today = new Date();
  const firstDayOfCurrentMonth = new Date(today);

  // set first day of month
  firstDayOfCurrentMonth.setDate(1);

  const year = firstDayOfCurrentMonth.getFullYear();
  // plus 1 cause month was count from 0
  const month = String(firstDayOfCurrentMonth.getMonth() + 1).padStart(2, '0');
  const day = String(firstDayOfCurrentMonth.getDate()).padStart(2, '0');

  switch (formatDate) {
    case 0: {
      // YYYY-MM-DD hh:mm
      return `${year}-${month}-${day} 00:00`;
    }
    case 1: {
      return firstDayOfCurrentMonth;
    }
    case 2: {
      // YYYY.MM
      return `${year}.${month}`;
    }
    default: {
      return firstDayOfCurrentMonth;
    }
  }
}

// Ex: addDays(3,7) => [3,4,5,6,7];
function addDays(fromDay, toDay) {
  const results = [];
  for(var i = fromDay; i <= toDay; i++) {
    results.push(i);
  }
  return results;
}

function isDateInCurrentMonth(dateTimeString) {
    // convert string dateTime to Date
    const dateObject = new Date(dateTimeString);
    const firstDayOfCurrentMonth = getFristDayOfMonthDateTimeString(1);
    return dateObject.getTime() > new Date(firstDayOfCurrentMonth).getTime();
}

// This func will remove not valid issues
// How to know which days user are holding that ticket? 
// Check from when user was assign to when user assign to anyone else
// Check from latest (last of array), valid if user hold that ticket in current month
// Return array of day user holding that ticket.
// Ex: [1,4,5,6,7,9,15,29] <=> user holding that ticket in day 1 4 5 .. of that month
// If not valid return []
function checkValidIssues(ticketId) {
  var properties = PropertiesService.getScriptProperties();
  var options = {
    method: 'GET'
  };
  options.headers = { "Authorization": "Basic " + Utilities.base64Encode(properties.getProperty('email') + ":" + properties.getProperty('credential')) };
  // https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-issueidorkey-changelog-get
  var response = UrlFetchApp.fetch(`https://earthbrain-sol.atlassian.net/rest/api/3/issue/${ticketId}/changelog`, options);
  var issueChangelogs = JSON.parse(response);
  // filter: get 2 logs when issue was assigned to member and member assign it to someone else
  const daysHoldingTicket = [];
  // flag is a date value (not null and not undefined) <=> date start of user holding that ticket, null if not
  var holdingTicketFlag = undefined;
  // default will order by created date of that changelog
  // So we'll check from 0 -> last element of changelogs
  issueChangelogs.values.forEach((log) => {
    // we'll have 5 cases here:
    // if (flag is not null and not undefined) and fromString = userName => user assign that ticket to someone else, set flag = null, add daysHoldingTicket from latest date to date of current log
    // if (flag is not null and not undefined) and toString = userName => not happened, you can't be assigned and holding that ticket at same time.
    // if flag null and fromString = userName => same above, not happened, cuz you can't assign that ticket to someone else and not holding that ticket at same time. 
    //  if flag null and toString = userName => user was assigned that ticket, flag = created date of log
    // special case: if flag = undefined and fromString = userName => user already hold that ticket, until day of change log, he assign it to someone else. So add current date => 1st date of month into daysHoldingTicket, set flag = null.
    // if flag = undefined and toString = userName, start add like normal ( ﾉ ﾟｰﾟ)ﾉ
    //
    // check if field is assigned (assign change log) and created date of log is in current month
    if (log.items[0].field === 'assignee' && isDateInCurrentMonth(log.created)) {
      if (log.items[0].fromString === userName) {
        if (holdingTicketFlag !== null && holdingTicketFlag !== undefined) {
          const dateOfChangeLog = new Date(log.created).getDate();
          const dateHolding = addDays(holdingTicketFlag.getDate(), dateOfChangeLog);
          daysHoldingTicket.push(dateHolding);
          holdingTicketFlag = null;
        }
        if (holdingTicketFlag === undefined) {
          const dateOfChangeLog = new Date(log.created).getDate()
          const dateHolding = addDays(1, dateOfChangeLog);
          daysHoldingTicket.push(dateHolding);
        }
      }
      if (log.items[0].toString === userName) {
        if (holdingTicketFlag === null || holdingTicketFlag === undefined) {
          holdingTicketFlag = new Date(log.created);
        }
      }
    }
  });
  return daysHoldingTicket;
}

function getAllIssuesUpdatedInCurrentMonth() {
  var properties = PropertiesService.getScriptProperties();
  var options = {
    method: 'GET'
  };
  options.headers = { "Authorization": "Basic " + Utilities.base64Encode(properties.getProperty('email') + ":" + properties.getProperty('credential')) };
  const dateTime = getFristDayOfMonthDateTimeString(0);
  // fields = status,summary to fetch only summary and status of issues
  var response = UrlFetchApp.fetch(`https://earthbrain-sol.atlassian.net/rest/api/3/search?jql=${encodeURIComponent(`project = "DEV" AND assignee WAS ${userIdJQL} AND status != "To Do" AND updatedDate >= '${dateTime}'`)}`, options);
  var issuesList = JSON.parse(response);
  var parsedDatas = [];
  issuesList.issues.forEach((issue) => {
    parsedDatas.push(issue.key);
  })
  return parsedDatas;
}

// fill empty cells with white background from G10 to G39, corresponding ticketId cells on sheet
function fillEmptyWhiteCellsG10G39(issues) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(getFristDayOfMonthDateTimeString(2));
  var range = sheet.getRange('G10:G39');
  var backgrounds = range.getBackgrounds();
  var values = range.getValues();
  
  for (var i = 0; i < values.length; i++) {
    var cellValue = values[i][0];
    var cellBackground = backgrounds[i][0];
    
    if (!cellValue && cellBackground === '#ffffff') {
      var row = range.getRow() + i;
      var column = range.getColumn();
      var cellAddress = sheet.getRange(row, column).getA1Notation();
      // take 2 last character then convert to number and minus 9 to get date :)
      const numberValue = parseInt(cellAddress.substring(1), 10);
      var dateFromCellAddress = numberValue - 9;
      if (issues[dateFromCellAddress] !== undefined) {
        sheet.getRange(cellAddress).setValue(issues[dateFromCellAddress]);
      };
    }
  }
}

function oneForAll() {
  const ticketIds = getAllIssuesUpdatedInCurrentMonth();
  const issuesHoldingDates = {};
  ticketIds.forEach((ticketId) => {
    const daysHoldingTicket = checkValidIssues(ticketId);
    if (daysHoldingTicket.length !== 0) {
      // remove duplicated elements
      const formattedDaysHoldingTicket = Array.from(new Set(daysHoldingTicket))[0];
      issuesHoldingDates[ticketId] = formattedDaysHoldingTicket;
    }
  })
  const issuesOrderByDate = {};
  for (var i = 1; i <= 32; i++) {
    var dateIssues = '';
    Object.keys(issuesHoldingDates).forEach((ticketId) => {
      if (issuesHoldingDates[ticketId].includes(i)) {
        if (dateIssues.length === 0) dateIssues =`${ticketId}`;
        else dateIssues += `, ${ticketId}`;
      }
    })
    dateIssues.length > 0 && (issuesOrderByDate[i] = dateIssues);
  }
  fillEmptyWhiteCellsG10G39(issuesOrderByDate);
}
